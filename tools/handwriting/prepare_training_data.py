"""Prepare verified local examples; this command does not train a model.

python tools/handwriting/prepare_training_data.py --input examples.json
Default output: handwriting-data/ (excluded from Git).
"""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import re
import struct


def prepare(payload, output, validation_fraction=0.2):
    if payload.get('schema') != 1 or not isinstance(payload.get('examples'), list):
        raise ValueError('Unsupported examples file')
    records, parents = {}, {}

    def group(document):
        parents.setdefault(document, document)
        if parents[document] != document:
            parents[document] = group(parents[document])
        return parents[document]

    for item in payload['examples']:
        text = item.get('text', '').strip()
        document = item.get('documentHash', '')
        kind = item.get('kind')
        image = item.get('image', {})
        if not text or len(text) > 4000 or kind not in ('text', 'code') or not re.fullmatch(r'[a-f0-9]{64}', document):
            raise ValueError('An example has an invalid label, kind, or document hash')
        if image.get('mime') != 'image/png':
            raise ValueError('Only exported PNG crops are supported')
        data = base64.b64decode(image.get('base64', ''), validate=True)
        if len(data) > 20 * 1024 * 1024 or len(data) < 24 or data[:8] != b'\x89PNG\r\n\x1a\n' or data[12:16] != b'IHDR':
            raise ValueError('Invalid crop image')
        width, height = struct.unpack('>II', data[16:24])
        if not width or not height or width * height > 20_000_000:
            raise ValueError('Invalid crop dimensions')
        image_hash = hashlib.sha256(data).hexdigest()
        key = image_hash + '-' + kind
        group(document)
        if key in records:
            if records[key]['text'] != text:
                raise ValueError('The same crop has conflicting labels; correct it before training')
            parents[group(document)] = group(records[key]['document'])
        records[key] = {'image': image_hash + '.png', 'text': text, 'kind': kind, 'document': document, 'layout': 'multiline' if '\n' in text else 'line', 'data': data}
    if not records:
        raise ValueError('No verified examples to prepare')
    groups = sorted({group(document) for document in parents})
    validation_count = min(len(groups) - 1, max(1, round(len(groups) * validation_fraction))) if len(groups) > 1 else 0
    validation_groups = set(sorted(groups, key=lambda d: hashlib.sha256(('validation:' + d).encode()).hexdigest())[:validation_count])
    train, validation = [], []
    output = Path(output).resolve()
    for name in ['train.jsonl', 'validation.jsonl', 'summary.json']:
        if (output / name).exists():
            raise ValueError('Output annotations already exist; choose another output directory')
    (output / 'images').mkdir(parents=True, exist_ok=True)
    for record in records.values():
        target = output / 'images' / record['image']
        if target.exists() and target.read_bytes() != record['data']:
            raise ValueError('Image name collision')
        target.write_bytes(record['data'])
        line = {key: value for key, value in record.items() if key != 'data'}
        (validation if group(record['document']) in validation_groups else train).append(line)
    for name, items in [('train', train), ('validation', validation)]:
        (output / (name + '.jsonl')).write_text(''.join(json.dumps(item, ensure_ascii=False) + '\n' for item in items), encoding='utf-8')
    summary = {'examples': len(records), 'documents': len(parents), 'independentGroups': len(groups),
               'train': len(train), 'validation': len(validation), 'splitBy': 'document', 'modelTrained': False,
               'lineExamples': sum(record['layout'] == 'line' for record in records.values()),
               'multilineExamples': sum(record['layout'] == 'multiline' for record in records.values()),
               'note': 'Prepared annotations are not proof of recognition accuracy. Multiline crops require reviewed line segmentation before training a line recognizer. Independent documents are required for evaluation.'}
    (output / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return summary


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True)
    parser.add_argument('--out', default='handwriting-data')
    parser.add_argument('--validation-fraction', type=float, default=0.2)
    args = parser.parse_args()
    if not 0 < args.validation_fraction < 0.5:
        parser.error('validation-fraction must be between 0 and 0.5')
    try:
        source = Path(args.input)
        if source.stat().st_size > 200 * 1024 * 1024:
            raise ValueError('Examples file exceeds 200 MB; export smaller batches')
        print(json.dumps(prepare(json.loads(source.read_text(encoding='utf-8')), args.out, args.validation_fraction), ensure_ascii=False, indent=2))
    except (ValueError, OSError) as error:
        parser.exit(1, str(error) + '\n')
