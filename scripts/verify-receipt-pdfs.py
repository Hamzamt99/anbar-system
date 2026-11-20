"""Inspect Chromium receipt exports; remove its sub-mm page-box rounding only.

Requires pypdf and pdfplumber. Content streams are never scaled or rewritten.
"""
from pathlib import Path
import hashlib
import json
import pdfplumber
from pypdf import PdfReader, PdfWriter
from pypdf.generic import RectangleObject

POINTS_PER_MM = 72 / 25.4
WIDTH, HEIGHT = 220 * POINTS_PER_MM, 190 * POINTS_PER_MM
results = []
for kind in ("normal", "long"):
    path = Path(f"output/pdf/anbar-receipt-{kind}-220x190.pdf")
    reader = PdfReader(path)
    assert len(reader.pages) == 1, f"{kind}: expected one page"
    page = reader.pages[0]
    raw_mm = (float(page.mediabox.width) / POINTS_PER_MM,
              float(page.mediabox.height) / POINTS_PER_MM)
    assert abs(raw_mm[0] - 220) < .2 and abs(raw_mm[1] - 190) < .2, raw_mm
    original_stream = hashlib.sha256(page.get_contents().get_data()).hexdigest()
    raw_path = Path(f"tmp/pdfs/receipt-{kind}-chromium-raw.pdf")
    raw_path.parent.mkdir(parents=True, exist_ok=True)
    raw_path.write_bytes(path.read_bytes())
    # Preserve the original layout at 100%: only the paper bounds change.
    for box in ("mediabox", "cropbox", "trimbox", "bleedbox", "artbox"):
        setattr(page, box, RectangleObject((0, 0, WIDTH, HEIGHT)))
    writer = PdfWriter()
    writer.add_page(page)
    with path.open("wb") as output:
        writer.write(output)
    verified = PdfReader(path)
    assert len(verified.pages) == 1
    p = verified.pages[0]
    assert abs(float(p.mediabox.width) / POINTS_PER_MM - 220) < .00001
    assert abs(float(p.mediabox.height) / POINTS_PER_MM - 190) < .00001
    assert hashlib.sha256(p.get_contents().get_data()).hexdigest() == original_stream
    with pdfplumber.open(path) as pdf:
        page = pdf.pages[0]
        text = page.extract_text() or ""
        for value in ("16:01", "16:15", "17:35", "16:45"):
            assert value in text, f"Missing time {value} in {kind}"
        for value in ("تسجيل الدخول", "تسجيل الخروج", "معاينة الطباعة", "حفظ الفاتورة"):
            assert value not in text and value[::-1] not in text
        margin = 5 * POINTS_PER_MM
        # Font glyphs may extend slightly beyond CSS inline boxes, but never paper margins.
        for char in page.chars:
            assert margin-.3 <= char['x0'] <= char['x1'] <= WIDTH-margin+.3, char
            assert margin-.3 <= char['top'] <= char['bottom'] <= HEIGHT-margin+.3, char
        assert len(page.images) == 1, "Receipt must have one uncropped PNG logo"
        image = page.images[0]
        assert image['x0'] < WIDTH / 3 and image['top'] < HEIGHT / 4
        assert image['x0'] >= margin-.3 and image['top'] >= margin-.3
        assert abs(image['width'] / image['height'] - 1435 / 1096) < .005
        # The two large title words must be centered near the top of the page.
        title = [c for c in page.chars if c['size'] > 20 and c['top'] < 60]
        assert title
        title_center = (min(c['x0'] for c in title) + max(c['x1'] for c in title)) / 2
        assert abs(title_center - WIDTH / 2) < 2 * POINTS_PER_MM
        results.append({"file":str(path), "pages":1, "width_mm":220,
                        "height_mm":190, "raw_chromium_mm":raw_mm,
                        "content_stream_unchanged":True,
                        "all_glyphs_inside_safe_margins":True,
                        "logo_upper_left":True,"title_centered":True,
                        "four_time_values_present":True})
Path('tmp/receipt-pdf-verification.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
print(json.dumps(results,ensure_ascii=False,indent=2))
