#!/usr/bin/env python3
"""
Runs gold prompts through the installed app and records what Jev answered, read from the
`VERA-SECTIONS ms=.. picked=..` hilog line. The TypeSafe key stays on the phone; nothing here
needs it. A generation that falls back to DeepSeek is stopped right after Jev's answer.

Needs the phone unlocked with the Generate page open (see the driving-the-device notes).
Coordinates are device pixels on the 1280x2832 screen.

    python3 tools/device-jev-sweep.py docs/prompts/template-select-gold.json -o /tmp/sweep.json
"""
import argparse, json, os, re, subprocess, time

HDC = os.environ.get('HDC', os.path.expanduser('~/Desktop/hdc/hdc'))
FIELD, GENERATE, NEW = (640, 653), (341, 998), (905, 544)
LINE = re.compile(r'VERA-SECTIONS ms=(\d+) picked=(.*)$')


def hdc(*args):
    return subprocess.run([HDC, *args], capture_output=True, text=True).stdout


def sections_line():
    out = hdc('shell', 'hilog -x | grep "VERA-SECTIONS ms=" | tail -1')
    m = LINE.search(out.strip())
    return (int(m.group(1)), m.group(2).strip()) if m else None


def raw_line():
    out = hdc('shell', 'hilog -x | grep "VERA-SECTIONS raw" | tail -1')
    m = re.search(r'VERA-SECTIONS raw (.*)$', out.strip())
    return m.group(1).strip() if m else ''


def clean(prompt, limit):
    text = re.sub(r"[^\x20-\x7e]", ' ', prompt).replace("'", '').replace('"', '').replace('`', '')
    return re.sub(r'\s+', ' ', text).strip()[:limit]


def verify_line(wait):
    deadline = time.time() + wait
    while time.time() < deadline:
        out = hdc('shell', 'hilog -x | grep "VERA-VERIFY ms=" | tail -1').strip()
        m = re.search(r'VERA-VERIFY ms=(\d+) weak=(\S*) confirm=(\S*) missing=(.*)$', out)
        if m:
            return {'ms': int(m.group(1)), 'weak': m.group(2), 'confirm': m.group(3), 'missing': m.group(4).strip()}
        time.sleep(1)
    return None


def run_one(prompt, limit, wait, verify=False, fast=False, expand_wait=False):
    hdc('shell', 'hilog -r')
    # A composed result collapses the prompt field into a header row. New brings the field back; when
    # the field is already open this tap lands inside it and does nothing.
    hdc('shell', 'uitest', 'uiInput', 'click', *map(str, NEW))
    time.sleep(1.0 if fast else 1.5)
    hdc('shell', 'uitest', 'uiInput', 'click', *map(str, FIELD))
    time.sleep(0.5 if fast else 0.8)
    # select all, delete: without this each prompt is typed after the previous one
    hdc('shell', 'uitest uiInput keyEvent 2072 2017')
    time.sleep(0.3)
    hdc('shell', 'uitest uiInput keyEvent 2055')
    time.sleep(0.3)
    hdc('shell', "uitest uiInput inputText %d %d '%s'" % (*FIELD, clean(prompt, limit)))
    time.sleep(0.5)
    hdc('shell', 'uitest', 'uiInput', 'click', *map(str, GENERATE))
    deadline = time.time() + wait
    found = None
    while time.time() < deadline and found is None:
        time.sleep(1)
        found = sections_line()
    if found is None:
        return None
    note = found[1]
    if expand_wait and (note.startswith('none') or note.startswith('vetoed')):
        # the app rewrites the request in parallel and asks Jev again when the first answer picked nothing; wait for
        # that answer (VERA-EXPAND used=... after the second Jev call, or rewrote=false when there was no rewrite)
        deadline2 = time.time() + 9
        while time.time() < deadline2:
            out = hdc('shell', 'hilog -x | grep -E "VERA-EXPAND (used=|ms=.*rewrote=false)" | tail -1').strip()
            if out:
                break
            time.sleep(0.3)
        found = sections_line() or found
        note = found[1]
    second = None
    if verify and note.startswith('none') and re.search(r's\d=(?!none)[a-z_]+@0\.(2[5-9]|[34]\d)', raw_line()):
        # a weak candidate: the app asks DeepSeek for a second opinion before it decides
        second = verify_line(25)
        if second is not None and second['confirm'] != 'none':
            time.sleep(8)  # confirmed: composed, let the content fill finish
            time.sleep(1)
            return found + (raw_line(), second)
        if second is not None:
            hdc('shell', 'uitest', 'uiInput', 'click', *map(str, GENERATE))  # not confirmed: generation starts, stop it
            time.sleep(1)
            return found + (raw_line(), second)
    if note.startswith('vetoed') or note.startswith('none') or 'logic=' in note:
        # falls back to DeepSeek, or hands the composed base to it: stop before the model call is paid for
        hdc('shell', 'uitest', 'uiInput', 'click', *map(str, GENERATE))  # the button is Stop now
    elif fast:
        hdc('shell', 'uitest', 'uiInput', 'click', *map(str, GENERATE))  # only Jev's answer matters: stop the content fill
        time.sleep(0.5)
    else:
        time.sleep(8)  # composed: let the content fill finish so the page is idle again
    time.sleep(1)
    return found + (raw_line(), second)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('gold')
    ap.add_argument('-o', '--out', required=True)
    ap.add_argument('--limit', type=int, default=400, help='characters of the prompt typed')
    ap.add_argument('--wait', type=int, default=20)
    ap.add_argument('--only', help='comma-separated ids')
    ap.add_argument('--fast', action='store_true', help='stop right after Jev answers instead of letting a composed screen finish')
    ap.add_argument('--expand', action='store_true', help='wait for the request rewrite and the second Jev answer when the first picked nothing')
    ap.add_argument('--verify', action='store_true', help='wait for the second opinion on weak picks (VERA-VERIFY)')
    args = ap.parse_args()
    rows = json.load(open(args.gold))
    if args.only:
        keep = set(args.only.split(','))
        rows = [r for r in rows if r['id'] in keep]
    results = []
    for r in rows:
        got = run_one(r['prompt'], args.limit, args.wait, args.verify, args.fast, args.expand)
        res = {'id': r['id'], 'label': r.get('label'), 'ms': got[0] if got else None, 'picked': got[1] if got else 'NO ANSWER', 'raw': got[2] if got else '', 'verify': got[3] if got else None}
        results.append(res)
        print(res['id'], '|', res['label'], '|', res['picked'], '|', res['ms'], flush=True)
        json.dump(results, open(args.out, 'w'), indent=1)
