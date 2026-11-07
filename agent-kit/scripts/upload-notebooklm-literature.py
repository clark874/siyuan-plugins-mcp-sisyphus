#!/usr/bin/env python3
"""将已验收的本地文献版本登记到 NotebookLM，并回读云端全文。"""

import argparse
from contextlib import contextmanager
from difflib import SequenceMatcher
import fcntl
from hashlib import sha256
from html.parser import HTMLParser
from inspect import signature
import json
import os
from pathlib import Path
import re
from tempfile import NamedTemporaryFile, TemporaryDirectory
from unicodedata import normalize
from unittest.mock import patch
from uuid import UUID, uuid4


DOCUMENT_ID = re.compile(r'\d{14}-[a-z0-9]{7}')
HASH = re.compile(r'[0-9a-f]{64}')
MARKDOWN_IMAGE = re.compile(r'!\[([^\]]*)\]\((?:[^()\n]|\([^()\n]*\))*\)')
MATH_SYMBOL = r'!=|<=|>=|==|\*\*|[+*/^<>=±×÷≤≥≠≈∝∞∑√∂∫%\-]'
MATH_TOKEN = re.compile(MATH_SYMBOL)
TEXT_TOKEN = re.compile(r'[-+]?(?:\d+\.\d+|\.\d+|\d+)(?:[eE][-+]?\d+)?%?|[^\W\d_]+|' + MATH_SYMBOL)


class TableText(HTMLParser):
    """只展开 HTML 表格，避免把公式中的尖括号当作标签。"""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)

    def handle_endtag(self, tag):
        if tag in {'td', 'th'}:
            self.parts.append(' | ')
        elif tag in {'tr', 'table', 'p', 'div'}:
            self.parts.append('\n')

    def handle_starttag(self, tag, attrs):
        if tag == 'br':
            self.parts.append('\n')
        elif tag == 'img':
            self.parts.append(dict(attrs).get('alt') or '')


def project_text(raw):
    def table(match):
        parser = TableText()
        parser.feed(match.group())
        parser.close()
        return '\n' + ''.join(parser.parts) + '\n'

    source = raw.decode('utf-8-sig').replace('\r\n', '\n')
    source = re.sub(r'\A---\n.*?\n---[ \t]*(?:\n|$)', '', source, count=1, flags=re.S)
    source = re.sub(r'<table\b[^>]*>.*?</table\s*>', table, source, flags=re.I | re.S)
    source = MARKDOWN_IMAGE.sub(r'\1', source)
    source = re.sub(r'<img\b[^>]*>', '', source, flags=re.I)
    source = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', ' ', source)
    if not source.strip():
        raise ValueError('全文投影为空')
    return source.encode('utf-8')


def matches_historical_payload(raw, payload):
    if payload == project_text(raw):
        return True
    # 复核早期全库脚本的确切转换，并容许其确定性的控制字符修复。
    parser = TableText()
    parser.feed(raw.decode('utf-8').replace('\r\n', '\n').replace('\r', '\n'))
    parser.close()
    legacy = ''.join(parser.parts)
    repaired = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '\ufffd', legacy)
    return payload in (legacy.encode('utf-8'), repaired.encode('utf-8'))


def text_tokens(value):
    value = normalize('NFKC', MARKDOWN_IMAGE.sub(r'\1', value)).replace('−', '-')
    # 云端正文会省略有序列表编号；减号和其他运算符始终保留，避免误删独立行公式。
    value = re.sub(r'(?m)^[ \t]*\d+[.)][ \t]+(?=\S)', '', value)
    return TEXT_TOKEN.findall(value)


def check_fulltext(payload, remote):
    source = payload.decode('utf-8')
    expected, actual = text_tokens(source), text_tokens(remote)
    if not expected or not actual:
        raise ValueError('云端全文回读为空')
    if expected == actual:
        return {'tokenCount': len(expected), 'exactNormalized': True}

    # 只容许云端省略源 Markdown 中真实的列表标记；不把云端独立行公式减号当成列表。
    list_positions = set()
    for marker in re.finditer(r'(?m)^[ \t]*([-+*])[ \t]+(?=\S)', source):
        prefix = source[:marker.start(1)]
        math = re.sub(r'\\\$', '', prefix)
        if (math.count('$$') % 2 or math.replace('$$', '').count('$') % 2
                or math.count(r'\[') > math.count(r'\]') or math.count(r'\(') > math.count(r'\)')):
            continue
        if len(re.findall(r'(?m)^[ \t]*(?:```|~~~)', prefix)) % 2:
            continue
        list_positions.add(len(text_tokens(prefix)))
    if list_positions:
        alignment = SequenceMatcher(None, expected, actual, autojunk=False)
        removed = {i for op, start, end, _, _ in alignment.get_opcodes() if op == 'delete'
                   and all(i in list_positions for i in range(start, end)) for i in range(start, end)}
        expected = [token for i, token in enumerate(expected) if i not in removed]
        if expected == actual:
            return {'tokenCount': len(expected), 'exactNormalized': True}

    # 允许极少排版差异，同时要求数字、符号与尾部逐项一致。
    numbers = lambda seq: [token for token in seq if any(c.isdigit() for c in token) or MATH_TOKEN.fullmatch(token)]
    size = min(30, len(expected))
    if numbers(expected) != numbers(actual) or expected[-size:] != actual[-size:]:
        raise ValueError('云端全文的数字、运算符或结尾存在差异，待核查')
    matcher = SequenceMatcher(None, expected, actual, autojunk=False)
    if (
        matcher.ratio() < .99
        or any(max(j - i, n - m) >= 20 for op, i, j, m, n in matcher.get_opcodes() if op != 'equal')
    ):
        raise ValueError('云端全文回读存在内容差异，待核查')
    return {'tokenCount': len(expected), 'exactNormalized': False, 'tokenRatio': round(matcher.ratio(), 6)}


def prepare(request):
    notebook_id = str(UUID(request['notebookId'])) if request.get('notebookId') else None
    title = request.get('notebookTitle')
    profile = request.get('profile')
    if not isinstance(title, str) or not title.strip() or '\n' in title or len(title) > 140:
        raise ValueError('笔记本标题须为 1 至 140 字的单行文本')
    if profile is not None and (not isinstance(profile, str) or not profile.strip()):
        raise ValueError('NotebookLM 配置名称无效')
    sources = request.get('sources')
    if not isinstance(sources, list) or not sources:
        raise ValueError('缺少全文来源清单')
    prepared = []
    document_ids = set()
    source_ids = set()
    for row in sources:
        document_id = row['documentId']
        source_hash = row['sourceSha256']
        source = Path(row['sourcePath'])
        adopted = str(UUID(row['sourceId'])) if row.get('sourceId') else None
        if not DOCUMENT_ID.fullmatch(document_id) or document_id in document_ids:
            raise ValueError('思源文档标识无效或重复')
        if not HASH.fullmatch(source_hash):
            raise ValueError('原始 Markdown 哈希格式无效')
        if not source.is_absolute() or source.suffix.lower() != '.md' or not source.is_file():
            raise ValueError('全文须为已存在的绝对 Markdown 路径')
        if adopted and (not notebook_id or adopted in source_ids):
            raise ValueError('接管来源需要明确的目标笔记本及唯一来源标识')
        document_ids.add(document_id)
        if adopted:
            source_ids.add(adopted)
        raw = source.read_bytes()
        if sha256(raw).hexdigest() != source_hash:
            raise ValueError('本机全文版本哈希不符，文档 ' + document_id)
        historical_path, historical_hash = row.get('adoptUploadPath'), row.get('adoptUploadSha256')
        if historical_path is not None or historical_hash is not None:
            if not adopted or not historical_path or not historical_hash or not HASH.fullmatch(historical_hash):
                raise ValueError('历史上传副本须配套显式来源标识及上传哈希')
            historical = Path(historical_path)
            if not historical.is_absolute() or historical.suffix.lower() not in {'.txt', '.md'} or not historical.is_file():
                raise ValueError('历史上传副本须为已存在的绝对文本路径')
            payload = historical.read_bytes()
            if sha256(payload).hexdigest() != historical_hash or not payload.decode('utf-8').strip():
                raise ValueError('历史上传副本为空或哈希不符')
            if not matches_historical_payload(raw, payload):
                raise ValueError('历史上传副本无法从该原始 Markdown 确认来源')
        else:
            payload = project_text(raw)
        upload_hash = sha256(payload).hexdigest()
        marker = f'sisyphus-{document_id}-{upload_hash}'
        label = re.sub(r'[^\w .-]+', ' ', row.get('title') or '', flags=re.UNICODE).strip(' .-')[:50]
        filename = f'{label} -- {marker}.txt' if label else marker + '.txt'
        prepared.append(({
            'documentId': document_id, 'sourceSha256': source_hash,
            'uploadSha256': upload_hash, 'uploadTitle': filename, 'uploadMarker': marker,
            'projection': 'historical' if historical_path else 'current',
        }, payload, adopted))
    return notebook_id, title.strip(), profile, prepared


def save_receipt(path, receipt):
    with NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent, delete=False) as output:
        temp = Path(output.name)
        try:
            json.dump(receipt, output, ensure_ascii=False, indent=2)
            output.write('\n')
            output.flush()
            os.fsync(output.fileno())
            output.close()
            os.replace(temp, path)
        finally:
            temp.unlink(missing_ok=True)


def verify_membership(records):
    ids = [str(UUID(row['id'])) for row in records]
    if len(set(ids)) != len(ids):
        raise ValueError('云端来源列表包含重复标识')
    return set(ids)


def ready_static_source(source):
    return bool(
        source and source.get('source_type') in {4, 8, 11} and source.get('status') == 2
        and not any(source.get(field) for field in ('url', 'drive_doc_id', 'can_sync'))
    )


def verify_notebook(client, notebook_id, expected_title):
    raw = client.get_notebook(notebook_id)
    data = raw[0] if isinstance(raw, list) and raw and isinstance(raw[0], list) else raw
    if (not isinstance(data, list) or len(data) < 3
            or data[0] != expected_title or data[2] != notebook_id):
        raise ValueError('NotebookLM 目标的标识和实际标题与收据不符')


@contextmanager
def single_rpc(client):
    """关闭非官方客户端的隐式重试，未知结果留给收据对账。"""
    call = client._call_rpc
    retry_fields = {'_retry': True, '_deep_retry': True, '_server_retry': 2**31}
    if not set(retry_fields).issubset(signature(call).parameters):
        raise ValueError('NotebookLM 客户端不支持已验收的单次写入协议')

    def invoke(*args, **kwargs):
        return call(*args, **{**kwargs, **retry_fields})

    with patch.object(client, '_call_rpc', invoke):
        yield


def add_file_once(client, notebook_id, target, registered):
    from notebooklm_tools.core import sources as sdk_sources

    register = client._register_file_source

    def register_and_save(*args, **kwargs):
        source_id = register(*args, **kwargs)
        registered(str(UUID(source_id)))
        return source_id

    def no_retry(action, *_args, **_kwargs):
        return action()

    with single_rpc(client), patch.object(client, '_register_file_source', register_and_save), patch.object(sdk_sources, 'execute_with_retry', no_retry):
        return client.add_file(notebook_id, target, wait=False)


def upload(client, receipt, save, prepared):
    def update():
        active = [receipt['versions'][key] for key in receipt['active'].values()]
        receipt['sources'] = [row for row in active if row.get('verified') is True]
        receipt['pending'] = [row for row in active if row.get('verified') is not True]
        save()

    if not receipt.get('notebookId'):
        title = receipt['remoteNotebookTitle']
        matches = [nb.id for nb in client.list_notebooks() if nb.title == title]
        if len(matches) > 1:
            raise ValueError('建库标记出现多个云端笔记本，待人工对账')
        if matches:
            receipt['notebookId'] = str(UUID(matches[0]))
            receipt['notebookState'] = 'bound'
            update()
        else:
            if receipt.get('notebookState') == 'create_pending':
                raise ValueError('上次建库结果待确认，未找到唯一目标')
            receipt['notebookState'] = 'create_pending'
            update()
            with single_rpc(client):
                notebook = client.create_notebook(title)
            if notebook is None:
                raise ValueError('云端未返回笔记本标识，保留建库待确认状态')
            receipt['notebookId'] = str(UUID(notebook.id))
            receipt['notebookState'] = 'bound'
            update()

    notebook_id = receipt['notebookId']
    verify_notebook(client, notebook_id, receipt['remoteNotebookTitle'])
    records = client.get_notebook_sources_with_types(notebook_id)
    member_ids = verify_membership(records)
    ready_ids = {row['id'] for row in records if ready_static_source(row)}
    failures = 0
    for key in receipt['active'].values():
        row = receipt['versions'][key]
        if row.get('verified') and row.get('sourceId') not in ready_ids:
            row.update(verified=False, state='source_missing', error='已登记来源已丢失或不再是就绪的静态文本')
    update()

    with TemporaryDirectory(prefix='sisyphus-literature-') as directory:
        for spec, payload, adopted in prepared:
            document_id = spec['documentId']
            key = version_key(spec)
            row = receipt['versions'].setdefault(key, {**spec, 'verified': False, 'state': 'planned'})
            try:
                already_used = {
                    value['sourceId'] for name, value in receipt['versions'].items()
                    if name != key and value.get('sourceId')
                    and (value['documentId'], value['uploadSha256']) != (document_id, spec['uploadSha256'])
                }
                source_id = row.get('sourceId')
                if adopted and source_id and adopted != source_id:
                    raise ValueError('显式来源与既有收据冲突')
                if source_id and source_id not in member_ids:
                    raise ValueError('已登记来源不在目标笔记本，保留原标识待对账')
                if adopted:
                    if adopted not in ready_ids or adopted in already_used:
                        raise ValueError('显式来源须为目标笔记本内已就绪、未绑定的静态文本')
                    source_id = adopted
                if not source_id:
                    matches = [
                        item['id'] for item in records
                        if (item.get('title') or '').removesuffix('.txt').endswith(spec['uploadMarker'])
                    ]
                    if len(matches) > 1 or matches and matches[0] in already_used:
                        raise ValueError('同一版本的远端来源不能唯一绑定')
                    if matches:
                        source_id = str(UUID(matches[0]))
                    elif row['state'] == 'upload_pending':
                        raise ValueError('上次上传结果待确认，未找到唯一来源')
                    else:
                        target = Path(directory) / spec['uploadTitle']
                        target.write_bytes(payload)
                        row.update(verified=False, state='upload_pending')
                        update()

                        def registered(source_id):
                            # 注册已产生远端标识，即使实际文件传送失败也先保存。
                            row.update(sourceId=source_id, state='registered')
                            update()

                        result = add_file_once(client, notebook_id, target, registered)
                        source_id = str(UUID(result['id']))
                        if row.get('sourceId') != source_id:
                            raise ValueError('注册标识与上传响应不一致，保留原标识待对账')
                        # 获取返回标识后立即落盘，后续失败只续作核查。
                        row.update(sourceId=source_id, state='uploaded')
                        update()
                        member_ids.add(source_id)
                        records.append({'id': source_id, 'title': spec['uploadTitle']})
                row.update(sourceId=source_id, verified=False, state='readback_pending')
                update()
                ready = client.wait_for_source_ready(notebook_id, source_id, timeout=90, poll_interval=2)
                if not ready_static_source(ready):
                    raise ValueError('云端来源不是已就绪的静态文本，待核查')
                result = client.get_source_fulltext(source_id)
                row['readback'] = check_fulltext(payload, result.get('content') or '')
                row.update(verified=True, state='verified')
                row.pop('error', None)
            except Exception as error:
                row.update(verified=False, error=str(error) if isinstance(error, ValueError) else type(error).__name__)
                failures += 1
            update()

    return failures


def version_key(spec):
    return spec['documentId'] + ':' + spec['sourceSha256'] + ':' + spec['uploadSha256']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--request', type=Path, required=True, help='本地上传请求清单')
    parser.add_argument('--receipt', type=Path, required=True, help='同一项目持续复用的本机收据')
    parser.add_argument('--execute', action='store_true', help='按本机 NotebookLM 配置上传与回读')
    args = parser.parse_args()
    try:
        if args.request.resolve() == args.receipt.resolve():
            raise ValueError('请求与收据须使用不同文件')
        request = json.loads(args.request.read_text(encoding='utf-8'))
        notebook_id, title, profile, prepared = prepare(request)
        if not args.execute:
            print(json.dumps({'mode': 'preview', 'notebookId': notebook_id, 'sources': [row for row, _, _ in prepared]}, ensure_ascii=False))
            return 0

        from notebooklm_tools.cli.utils import get_client

        args.receipt.parent.mkdir(parents=True, exist_ok=True)
        lock_path = args.receipt.with_name(args.receipt.name + '.lock')
        with lock_path.open('a', encoding='utf-8') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            receipt = json.loads(args.receipt.read_text(encoding='utf-8')) if args.receipt.exists() else {
                'version': 1, 'notebookTitle': title, 'profile': profile, 'notebookId': None,
                'remoteNotebookTitle': title if notebook_id else title + ' · Sisyphus ' + uuid4().hex[:12],
                'notebookState': 'planned',
                'active': {}, 'versions': {}, 'sources': [], 'pending': [],
            }
            if (receipt.get('version') != 1 or receipt['profile'] != profile or receipt['notebookTitle'] != title
                    or notebook_id and receipt['notebookId'] not in {None, notebook_id}):
                raise ValueError('请求目标与既有收据不一致')
            client = get_client(profile)
            if notebook_id and receipt['notebookId'] is None:
                verify_notebook(client, notebook_id, receipt['remoteNotebookTitle'])
                receipt.update(notebookId=notebook_id, notebookState='bound')
            for spec, _, _ in prepared:
                key = version_key(spec)
                if any(name != key and row['documentId'] == spec['documentId']
                       and row['sourceSha256'] == spec['sourceSha256']
                       and (row.get('sourceId') or row['state'] == 'upload_pending')
                       for name, row in receipt['versions'].items()):
                    raise ValueError('同一原文版本已有另一上传副本，请沿用已登记投影')
                receipt['active'][spec['documentId']] = key
                receipt['versions'].setdefault(key, {**spec, 'verified': False, 'state': 'planned'})
            active = [receipt['versions'][key] for key in receipt['active'].values()]
            receipt['sources'] = [row for row in active if row['verified']]
            receipt['pending'] = [row for row in active if not row['verified']]
            save = lambda: save_receipt(args.receipt, receipt)
            save()
            failures = upload(client, receipt, save, prepared)
            print(json.dumps({'notebookId': receipt['notebookId'], 'verified': len(receipt['sources']), 'pending': len(receipt['pending'])}, ensure_ascii=False))
            return 1 if failures else 0
    except (OSError, ValueError, TypeError, KeyError) as error:
        parser.exit(1, str(error) + '\n')
    except Exception as error:
        parser.exit(1, 'NotebookLM 链路失败，详查本地收据。错误类型 ' + type(error).__name__ + '\n')


if __name__ == '__main__':
    raise SystemExit(main())
