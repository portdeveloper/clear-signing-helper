import unittest
from ledger_screen_check import compare_fields


class ScreenChecks(unittest.TestCase):
    def test_columnwise_tuple_array_is_not_a_pass(self):
        expected = [{'label': k, 'value': v} for k, v in [('To', '0x11'), ('Value', '111'), ('To', '0x22'), ('Value', '222')]]
        fields, ordered = compare_fields(expected, ['To 0x11 To 0x22 Reject 2 of 4', 'Value 111 Value 222 Reject 3 of 4'])
        self.assertTrue(all(f['foundTogether'] for f in fields))
        self.assertFalse(ordered)

    def test_wrapping_and_duplicate_polls_preserve_valid_order(self):
        expected = [{'label': 'To', 'value': '0x1122'}, {'label': 'Value', 'value': '111'}]
        fields, ordered = compare_fields(expected, ['To 0x11 22 Value 111 Reject 2 of 3'] * 4)
        self.assertTrue(ordered)
        self.assertTrue(all(f['foundTogether'] for f in fields))

    def test_partial_numeric_or_hex_value_is_not_a_match(self):
        for expected, actual in [('1', '111'), ('0x', '0xabcd'), ('0x11', '0x1122')]:
            fields, ordered = compare_fields([{'label': 'Value', 'value': expected}], [f'Value {actual} Reject 2 of 3'])
            self.assertFalse(ordered)
            self.assertFalse(fields[0]['foundTogether'])

    def test_truncated_label_is_not_an_exact_label_match(self):
        fields, ordered = compare_fields([{'label': 'Pay By Vault Contract', 'value': 'true'}], ['Pay By Vault Cont... true Max fees 0 ETH'])
        self.assertFalse(ordered)
        self.assertFalse(fields[0]['foundTogether'])


if __name__ == '__main__':
    unittest.main()
