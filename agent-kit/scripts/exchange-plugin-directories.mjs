import { execFile } from 'node:child_process';
import { lstat } from 'node:fs/promises';
import { promisify } from 'node:util';

const executeFile = promisify(execFile);

// Node 的 rename 不能覆盖非空目录；必须使用一次系统调用交换两个完整目录。
const exchangeProgram = `
import ctypes, os, sys
libc = ctypes.CDLL(None, use_errno=True)
current, staged = map(os.fsencode, sys.argv[1:])
if sys.platform == 'darwin':
    exchange = libc.renamex_np
    exchange.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_uint]
    result = exchange(current, staged, 2)
elif sys.platform.startswith('linux'):
    exchange = libc.renameat2
    exchange.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    result = exchange(-100, current, -100, staged, 2)
else:
    raise RuntimeError('当前系统不支持插件目录原子交换')
if result != 0:
    code = ctypes.get_errno()
    raise OSError(code, os.strerror(code))
`;

export async function exchangePluginDirectories(current, staged) {
    const [currentStat, stagedStat] = await Promise.all([lstat(current), lstat(staged)]);
    if (!currentStat.isDirectory() || !stagedStat.isDirectory() || currentStat.dev !== stagedStat.dev) {
        throw new Error('原子换装要求同一文件系统上的两个真实目录；不会替换符号链接。');
    }
    try {
        await executeFile('python3', ['-c', exchangeProgram, current, staged]);
    } catch (error) {
        throw new Error(`原子交换失败，未采用删除或两次重命名的降级方案。需要 Python 3 和支持目录交换的 macOS/Linux 文件系统：${error.message}`);
    }
}
