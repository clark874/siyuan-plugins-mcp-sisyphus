#!/usr/bin/env python3
"""按固定模板查询 NotebookLM，保留引用和本地正文标识。"""

import argparse
from hashlib import sha256
import json
from pathlib import Path
import re
from time import monotonic
from uuid import UUID


TEMPLATE = Path(__file__).resolve().parent.parent / 'templates' / 'notebooklm-literature-v1.md'
DOCUMENT_ID = re.compile(r'\d{14}-[a-z0-9]{7}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--scope', type=Path, required=True, help='笔记本与来源映射清单')
    parser.add_argument('--question', required=True, help='原始研究问题')
    parser.add_argument('--output', type=Path, required=True, help='新增结果文件，禁止覆盖')
    parser.add_argument('--profile', help='NotebookLM 已登录配置名称')
    parser.add_argument('--timeout', type=float, default=180, help='单题超时秒数')
    parser.add_argument('--render-only', action='store_true', help='只保存渲染后的请求')
    args = parser.parse_args()

    if not args.question.strip() or args.timeout <= 0:
        parser.error('问题不能为空，超时必须为正数')
    scope = json.loads(args.scope.read_text(encoding='utf-8'))
    if args.profile and scope.get('profile') and args.profile != scope['profile']:
        parser.error('指定账号与来源收据不一致')
    profile = args.profile or scope.get('profile')
    notebook_id = str(UUID(scope['notebookId']))
    sources = scope['sources']
    by_id = {}
    documents = set()
    for source in sources:
        source_id = str(UUID(source['sourceId']))
        document_id = source['documentId']
        if source_id in by_id or document_id in documents or not DOCUMENT_ID.fullmatch(document_id):
            parser.error('来源映射须由唯一的云端来源与思源正文构成')
        by_id[source_id] = document_id
        documents.add(document_id)
    if not by_id:
        parser.error('必须显式提供非空来源范围')

    template = TEMPLATE.read_bytes()
    prompt = template.decode('utf-8')
    if prompt.count('{{QUESTION}}') != 1:
        raise ValueError('提示词模板应有唯一问题占位符')
    prompt = prompt.replace('{{QUESTION}}', args.question.strip())
    record = {
        'question': args.question.strip(), 'prompt': prompt,
        'template': TEMPLATE.name, 'templateSha256': sha256(template).hexdigest(),
        'promptSha256': sha256(prompt.encode('utf-8')).hexdigest(),
        'notebookId': notebook_id, 'sources': sources, 'newConversation': True,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open('x', encoding='utf-8') as output:
        if not args.render_only:
            from notebooklm_tools.cli.utils import get_client

            start = monotonic()
            try:
                response = get_client(profile).query(notebook_id, prompt, source_ids=list(by_id),
                                                         new_conversation=True, timeout=args.timeout)
                if not response or not response.get('answer'):
                    raise ValueError('没有返回答案')
            except Exception as error:
                record['errorType'] = type(error).__name__
                output.write(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
                raise
            record['elapsedSeconds'] = round(monotonic() - start, 3)
            record['response'] = response
            record['citationTargets'] = [
                {'citationNumber': ref.get('citation_number'), 'sourceId': ref.get('source_id'),
                 'documentId': by_id.get(ref.get('source_id'))}
                for ref in response.get('references', [])
            ]
        output.write(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
    print(args.output.resolve())


if __name__ == '__main__':
    main()
