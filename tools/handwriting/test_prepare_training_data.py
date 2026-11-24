import base64
import copy
import hashlib
import json
from pathlib import Path
import struct
import tempfile
import unittest
import zlib

from prepare_training_data import prepare


def png(color):
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
    header = struct.pack('>IIBBBBB', 8, 8, 8, 2, 0, 0, 0)
    pixels = (b'\x00' + bytes(color) * 8) * 8
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) + chunk(b'IDAT', zlib.compress(pixels)) + chunk(b'IEND', b'')


def example(document, color, text='Монитор'):
    return {'documentHash': hashlib.sha256(document.encode()).hexdigest(), 'kind': 'text', 'text': text,
            'image': {'mime': 'image/png', 'base64': base64.b64encode(png(color)).decode()}}


class TrainingDataTests(unittest.TestCase):
    def test_lines_from_same_photo_do_not_leak_into_validation(self):
        samples = [example('a', (1, 2, 3)), example('a', (3, 2, 1)), example('b', (4, 5, 6)), example('c', (7, 8, 9))]
        with tempfile.TemporaryDirectory() as folder:
            summary = prepare({'schema': 1, 'examples': samples}, folder)
            self.assertFalse(summary['modelTrained'])
            train = [json.loads(line) for line in (Path(folder) / 'train.jsonl').read_text(encoding='utf-8').splitlines()]
            validation = [json.loads(line) for line in (Path(folder) / 'validation.jsonl').read_text(encoding='utf-8').splitlines()]
            self.assertFalse({r['document'] for r in train} & {r['document'] for r in validation})
            self.assertEqual(len(train) + len(validation), 4)
            self.assertTrue(all((Path(folder) / 'images' / r['image']).is_file() for r in train + validation))

    def test_duplicate_crops_connect_source_photos(self):
        samples = [example('a', (1, 2, 3)), example('b', (1, 2, 3)), example('b', (4, 5, 6))]
        with tempfile.TemporaryDirectory() as folder:
            summary = prepare({'schema': 1, 'examples': samples}, folder)
            self.assertEqual(summary['examples'], 2)
            self.assertEqual(summary['independentGroups'], 1)
            self.assertEqual(summary['validation'], 0)

    def test_conflicting_labels_are_rejected_before_writing(self):
        sample = example('a', (1, 2, 3))
        conflict = copy.deepcopy(sample)
        conflict['text'] = 'Принтер'
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(ValueError, 'conflicting labels'):
                prepare({'schema': 1, 'examples': [sample, conflict]}, folder)
            self.assertFalse((Path(folder) / 'images').exists())

    def test_invalid_document_and_image_are_rejected(self):
        for change in [('documentHash', '../../private'), ('image', {'mime': 'text/html', 'base64': 'PGh0bWw+'})]:
            sample = example('a', (1, 2, 3))
            sample[change[0]] = change[1]
            with tempfile.TemporaryDirectory() as folder:
                with self.assertRaises(ValueError):
                    prepare({'schema': 1, 'examples': [sample]}, folder)

    def test_existing_annotations_are_preserved(self):
        payload = {'schema': 1, 'examples': [example('a', (1, 2, 3))]}
        with tempfile.TemporaryDirectory() as folder:
            prepare(payload, folder)
            before = (Path(folder) / 'train.jsonl').read_bytes()
            with self.assertRaisesRegex(ValueError, 'already exist'):
                prepare(payload, folder)
            self.assertEqual(before, (Path(folder) / 'train.jsonl').read_bytes())


if __name__ == '__main__':
    unittest.main()
