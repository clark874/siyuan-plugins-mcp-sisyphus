#!/usr/bin/env python3
"""mdtx 配置桥接：供 SiYuan 插件读写 mdtx 配置、术语表与翻译记忆。

由 mdtx 安装自带的 Python 运行（见 desktop-runner 的解释器解析），
stdin 接收一行 JSON 请求，stdout 输出一行 JSON 回执：
    {"ok": true, ...} / {"ok": false, "error": "..."}

语义与 mdtx 桌面端 src/api/app.py 保持一致：配置读取返回掩码，
写入剥离掩码值，api_key 永不出现在输出中。配置文件缺失时返回
默认配置但绝不创建文件；写入使用临时文件 + 原子替换，权限 0600。
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path
from typing import Any

API_KEY_MASK = "********"

_CONFIG_WRITABLE_SECTIONS = {
    "target_languages",
    "provider",
    "pipeline",
    "segmentation",
    "input",
    "style",
    "output",
    "execution",
    "memory",
}

_IMPORT_HINT = "所选 mdtx 不是可读取配置的 Python 安装版本，请确认填写的是 mdtx 的 Python 环境。"


def _emit(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def _infra():
    try:
        from src.infra import config as infra
    except ImportError as exc:
        raise RuntimeError(f"{_IMPORT_HINT}（{getattr(exc, 'name', None) or exc}）") from exc
    return infra


def _yaml():
    try:
        import yaml
    except ImportError as exc:
        raise RuntimeError(f"{_IMPORT_HINT}（缺少 PyYAML）") from exc
    return yaml


def _resolve_path(config_path: str, infra) -> Path:
    """空路径回落到 mdtx 桌面默认 ~/.mdtx/config.yaml；显式路径只做 ~ 展开。"""
    if config_path:
        return Path(config_path).expanduser()
    return infra.default_user_config_path()


def _load_config(config_path: str):
    """返回 (TranslatorConfig, Path, exists)。文件不存在时返回默认配置且不落盘。"""
    infra = _infra()
    path = _resolve_path(config_path, infra)
    if not path.exists():
        return infra.TranslatorConfig(), path, False
    config = infra.load_config(str(path))
    return config, path, True


def _mask_config(config) -> dict[str, Any]:
    """与 src/api/app.py 的 _mask_config 输出形状一致。"""
    return {
        "target_languages": list(config.target_languages),
        "provider": {
            "name": config.provider.name,
            "base_url": config.provider.base_url,
            "api_key": API_KEY_MASK if config.provider.api_key else "",
            "api_key_env": config.provider.api_key_env,
            "model": config.provider.model,
            "temperature": config.provider.temperature,
            "max_tokens": config.provider.max_tokens,
            "structured_outputs": config.provider.structured_outputs,
            "max_retries": config.provider.max_retries,
        },
        "pipeline": {
            "mode": config.pipeline.mode,
            "enable_review": config.pipeline.enable_review,
            "enable_format_guard": config.pipeline.enable_format_guard,
            "fail_on_validation_error": config.pipeline.fail_on_validation_error,
            "review_max_rounds": config.pipeline.review_max_rounds,
            "enable_glossary": config.pipeline.enable_glossary,
            "enable_sentinels": config.pipeline.enable_sentinels,
            "enable_anchor_scheduling": config.pipeline.enable_anchor_scheduling,
            "enable_context_pull": config.pipeline.enable_context_pull,
            "enable_final_edit": config.pipeline.enable_final_edit,
            "final_edit_max_segments": config.pipeline.final_edit_max_segments,
            "reviewer_model": config.pipeline.reviewer_model,
            "judge_model": config.pipeline.judge_model,
            "fast_model": config.pipeline.fast_model,
            "quality_model": config.pipeline.quality_model,
            "brief_model": config.pipeline.brief_model,
        },
        "segmentation": {
            "max_bundle_tokens": config.segmentation.max_bundle_tokens,
            "min_bundle_tokens": config.segmentation.min_bundle_tokens,
        },
        "input": {"file_pattern": config.input.file_pattern},
        "style": {
            "tone": config.style.tone,
            "audience": config.style.audience,
            "preserve_terms": list(config.style.preserve_terms),
            "instructions": list(config.style.instructions),
        },
        "output": {
            "directory": config.output.directory,
            "file_suffix_template": config.output.file_suffix_template,
            "write_report": config.output.write_report,
        },
        "execution": {"max_parallel_translations": config.execution.max_parallel_translations},
        "memory": {
            "enabled": config.memory.enabled,
            "path": config.memory.path,
            "scope": config.memory.scope,
            "fuzzy_examples": config.memory.fuzzy_examples,
            "reuse_min_confidence": config.memory.reuse_min_confidence,
            "glossary_persist": config.memory.glossary_persist,
            "glossary_path": config.memory.glossary_path,
            "brief_path": config.memory.brief_path,
        },
    }


def _strip_mask(patch: dict[str, Any], existing: dict[str, Any]) -> dict[str, Any]:
    """与 app.py 一致：掩码或空 api_key 保留已存密钥，其余原样剥离。"""
    import copy

    cleaned = copy.deepcopy(patch)
    provider = cleaned.get("provider")
    if isinstance(provider, dict) and "api_key" in provider:
        incoming = provider.pop("api_key")
        if incoming and incoming != API_KEY_MASK:
            provider["api_key"] = incoming
        else:
            existing_key = (existing.get("provider") or {}).get("api_key")
            if existing_key and incoming == API_KEY_MASK:
                provider["api_key"] = existing_key
    return cleaned


def _merge_dict(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    result = dict(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = _merge_dict(result[key], value)
        else:
            result[key] = value
    return result


def _cmd_get(request: dict[str, Any]) -> dict[str, Any]:
    config, path, exists = _load_config(str(request.get("configPath") or ""))
    return {"config": _mask_config(config), "config_path": str(path), "exists": exists}


def _cmd_patch(request: dict[str, Any]) -> dict[str, Any]:
    patch = request.get("patch")
    if not isinstance(patch, dict) or not patch:
        raise ValueError("patch 必须是非空对象")
    unknown = sorted(set(patch) - _CONFIG_WRITABLE_SECTIONS)
    if unknown:
        raise ValueError("Unsupported config keys: " + ", ".join(unknown))
    infra = _infra()
    yaml = _yaml()
    path = _resolve_path(str(request.get("configPath") or ""), infra)
    existing: dict[str, Any] = {}
    if path.exists():
        try:
            existing = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        except yaml.YAMLError as exc:
            raise ValueError(f"Existing config is not valid YAML: {exc}") from exc
        if not isinstance(existing, dict):
            raise ValueError("Existing config is not a YAML mapping")
    cleaned = _strip_mask(patch, existing)
    merged = _merge_dict(existing, cleaned)
    # translate-literature 依赖 source.zh.md.report.json，写入时强制开启校验报告。
    output = dict(merged.get("output") or {})
    output["write_report"] = True
    merged["output"] = output
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = yaml.safe_dump(merged, allow_unicode=True, sort_keys=False)
    descriptor, temporary = tempfile.mkstemp(dir=str(path.parent), prefix=path.name + ".", suffix=".tmp")
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(payload)
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    except BaseException:
        try:
            os.unlink(temporary)
        except OSError:
            pass
        raise
    os.chmod(path, 0o600)
    config = infra.load_config(str(path))
    return {"config": _mask_config(config), "config_path": str(path), "exists": True}


def _cmd_test(request: dict[str, Any]) -> dict[str, Any]:
    import time

    try:
        import httpx
    except ImportError as exc:
        raise RuntimeError(f"{_IMPORT_HINT}（缺少 httpx）") from exc
    config, _path, _exists = _load_config(str(request.get("configPath") or ""))
    base_url = str(request.get("base_url") or config.provider.base_url or "").rstrip("/")
    api_key = request.get("api_key")
    if api_key in (None, "", API_KEY_MASK):
        api_key = config.provider.api_key
    model = str(request.get("model") or config.provider.model or "")
    if not base_url:
        raise ValueError("base_url is not configured")
    started = time.monotonic()
    try:
        response = httpx.get(
            f"{base_url}/models",
            headers={"Authorization": f"Bearer {api_key}"} if api_key else {},
            timeout=8.0,
        )
    except httpx.HTTPError as exc:
        return {"test": {"ok": False, "base_url": base_url, "latency_ms": None, "error": f"连接失败: {exc}"}}
    latency_ms = int((time.monotonic() - started) * 1000)
    if response.status_code != 200:
        return {"test": {
            "ok": False,
            "base_url": base_url,
            "latency_ms": latency_ms,
            "error": f"HTTP {response.status_code}: {response.text[:200]}",
        }}
    try:
        model_ids = [item.get("id") for item in response.json().get("data", [])]
    except ValueError:
        model_ids = []
    model_warning = model and model_ids and model not in model_ids
    return {"test": {
        "ok": True,
        "base_url": base_url,
        "latency_ms": latency_ms,
        "models": model_ids,
        "model_warning": f"模型 {model} 不在网关模型列表中，请确认名称是否正确" if model_warning else None,
        "error": None,
    }}


def _glossary_store(config_path: str):
    try:
        from src.memory.glossary_store import build_glossary_store
    except ImportError as exc:
        raise RuntimeError(f"{_IMPORT_HINT}（{getattr(exc, 'name', None) or exc}）") from exc
    config, _path, _exists = _load_config(config_path)
    return build_glossary_store(config)


def _memory_store(config_path: str):
    try:
        from src.memory.translation_memory import build_memory
    except ImportError as exc:
        raise RuntimeError(f"{_IMPORT_HINT}（{getattr(exc, 'name', None) or exc}）") from exc
    config, _path, _exists = _load_config(config_path)
    return build_memory(config)


def _cmd_glossary_list(request: dict[str, Any]) -> dict[str, Any]:
    store = _glossary_store(str(request.get("configPath") or ""))
    lang = str(request.get("lang") or "")
    languages = [lang] if lang else (store.languages() if hasattr(store, "languages") else [])
    return {"entries": {item: store.entries(item) for item in languages}}


def _cmd_glossary_upsert(request: dict[str, Any]) -> dict[str, Any]:
    lang = str(request.get("lang") or "")
    term = str(request.get("term") or "")
    rendering = str(request.get("rendering") or "")
    if not term.strip() or not rendering.strip():
        raise ValueError("term and rendering must be non-empty")
    _glossary_store(str(request.get("configPath") or "")).upsert(lang, term, rendering, origin="user")
    return {"lang": lang, "term": term.strip(), "rendering": rendering.strip()}


def _cmd_glossary_delete(request: dict[str, Any]) -> dict[str, Any]:
    lang = str(request.get("lang") or "")
    term = str(request.get("term") or "")
    if not _glossary_store(str(request.get("configPath") or "")).delete(lang, term):
        raise ValueError(f"Unknown glossary entry: {term}")
    return {"lang": lang, "term": term, "deleted": True}


def _cmd_glossary_status(request: dict[str, Any]) -> dict[str, Any]:
    lang = str(request.get("lang") or "")
    term = str(request.get("term") or "")
    status = str(request.get("status") or "")
    store = _glossary_store(str(request.get("configPath") or ""))
    if not hasattr(store, "set_status") or not store.set_status(lang, term, status):
        raise ValueError(f"Unknown glossary entry: {term}")
    return {"lang": lang, "term": term, "status": status}


def _cmd_memory_stats(request: dict[str, Any]) -> dict[str, Any]:
    memory = _memory_store(str(request.get("configPath") or ""))
    stats = dict(memory.stats())
    if hasattr(memory, "entry_count"):
        stats["entries"] = memory.entry_count()
    return {"stats": stats}


def _cmd_memory_clear(request: dict[str, Any]) -> dict[str, Any]:
    removed = _memory_store(str(request.get("configPath") or "")).clear_all()
    return {"removed": removed}


_COMMANDS = {
    "get": _cmd_get,
    "patch": _cmd_patch,
    "test": _cmd_test,
    "glossary_list": _cmd_glossary_list,
    "glossary_upsert": _cmd_glossary_upsert,
    "glossary_delete": _cmd_glossary_delete,
    "glossary_status": _cmd_glossary_status,
    "memory_stats": _cmd_memory_stats,
    "memory_clear": _cmd_memory_clear,
}


def main() -> None:
    try:
        os.chdir(Path.home())
    except OSError:
        pass
    raw = sys.stdin.read()
    try:
        request = json.loads(raw or "{}")
    except json.JSONDecodeError as exc:
        _emit({"ok": False, "error": f"请求不是有效 JSON：{exc}"})
        return
    if not isinstance(request, dict):
        _emit({"ok": False, "error": "请求必须是 JSON 对象"})
        return
    command = request.get("command")
    handler = _COMMANDS.get(str(command))
    if handler is None:
        _emit({"ok": False, "error": f"未知桥接命令：{command}"})
        return
    try:
        result = handler(request)
        _emit({"ok": True, **result})
    except Exception as exc:  # noqa: BLE001 - 桥接统一把异常转成错误回执
        message = str(exc).strip() or exc.__class__.__name__
        _emit({"ok": False, "error": message})


if __name__ == "__main__":
    main()
