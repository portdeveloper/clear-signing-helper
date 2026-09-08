"""Conservative text checks for the captured Ledger screens used by our probes.

This is evidence checking, not a general wallet renderer or pixel-layout proof.
"""
import re


def compare_fields(expected, texts):
    compact = lambda value: re.sub(r'\s+', '', value)
    screens = []
    for text in texts:
        if not screens or screens[-1] != text:
            screens.append(text)
    pages = [compact(text) for text in screens]
    stream = ''.join(pages)
    boundaries = [compact(f['label']) for f in expected] + ['Reject', 'Maxfees', 'Signtransaction', 'Transactionsigned']

    def positions(text, needle):
        start = 0
        while (offset := text.find(needle, start)) >= 0:
            end = offset + len(needle)
            # Reject a matching prefix of a larger numeric/hex value. The
            # expected value must end at the next displayed label or UI text.
            if end == len(text) or any(text.startswith(boundary, end) for boundary in boundaries):
                yield offset
            start = offset + 1

    fields, cursor = [], 0
    for field in expected:
        needle = compact(field['label'] + field['value'])
        position = next((p for p in positions(stream, needle) if p >= cursor), None)
        fields.append({**field, 'foundTogether': any(next(positions(page, needle), None) is not None for page in pages), 'foundInOrder': position is not None})
        if position is not None:
            cursor = position + len(needle)
    return fields, all(f['foundInOrder'] for f in fields)
