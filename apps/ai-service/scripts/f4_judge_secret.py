"""F4-only Windows current-user DPAPI storage, outside the repository.

Secrets enter via stdin, never argv, logging, .env or a system-wide setting.
This does not create/revoke Google keys or configure the application's provider.
"""
import argparse
import ctypes
from ctypes import wintypes
import os
from pathlib import Path
import sys
import json

DEFAULT_KEY_FILE=Path.home()/'.codex'/'secrets'/'hr-blockbot-f4-judge.dpapi'


def crypt(raw,protect):
    if os.name!='nt':raise ValueError('WINDOWS_CURRENT_USER_DPAPI_REQUIRED')
    class Blob(ctypes.Structure):
        _fields_=[('size',wintypes.DWORD),('data',ctypes.POINTER(ctypes.c_ubyte))]
    def blob(value):
        buffer=ctypes.create_string_buffer(value)
        return Blob(len(value),ctypes.cast(buffer,ctypes.POINTER(ctypes.c_ubyte))),buffer
    source,source_buffer=blob(raw);entropy,entropy_buffer=blob(b'HRBlockBot:F4:Judge:v1');output=Blob()
    library=ctypes.WinDLL('crypt32',use_last_error=True)
    operation=library.CryptProtectData if protect else library.CryptUnprotectData
    operation.argtypes=[ctypes.POINTER(Blob),ctypes.c_void_p,ctypes.POINTER(Blob),ctypes.c_void_p,
                        ctypes.c_void_p,wintypes.DWORD,ctypes.POINTER(Blob)]
    operation.restype=wintypes.BOOL
    if not operation(ctypes.byref(source),None,ctypes.byref(entropy),None,None,1,ctypes.byref(output)):
        raise ValueError('DPAPI_OPERATION_FAILED')
    free=ctypes.WinDLL('kernel32',use_last_error=True).LocalFree
    free.argtypes=[ctypes.c_void_p];free.restype=ctypes.c_void_p
    try:return ctypes.string_at(output.data,output.size)
    finally:free(output.data)


def save_key(key,path=DEFAULT_KEY_FILE):
    if type(key) is not str or not key.strip() or key!=key.strip() or '\n' in key or '\r' in key:
        raise ValueError('INVALID_SINGLE_LINE_SECRET')
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    encrypted=crypt(key.encode('utf-8'),True)
    if crypt(encrypted,False).decode('utf-8')!=key:raise ValueError('DPAPI_ROUND_TRIP_FAILED')
    # Exclusive create never overwrites an unrelated/pre-existing credential.
    with path.open('xb') as handle:handle.write(encrypted);handle.flush();os.fsync(handle.fileno())


def load_key(path=DEFAULT_KEY_FILE):
    value=crypt(Path(path).read_bytes(),False).decode('utf-8')
    if not value.strip() or '\n' in value or '\r' in value:raise ValueError('INVALID_STORED_SECRET')
    return value


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--store-stdin',action='store_true');args=parser.parse_args()
    try:
        if args.store_stdin:save_key(sys.stdin.readline().rstrip('\r\n'))
        configured=DEFAULT_KEY_FILE.exists() and bool(load_key())
        print(json.dumps({'configured':configured,'storage':'Windows current-user DPAPI','path':str(DEFAULT_KEY_FILE)}))
    except Exception as error:
        print(json.dumps({'configured':False,'errorType':type(error).__name__}),file=sys.stderr)
        raise SystemExit(1)


if __name__=='__main__':main()
