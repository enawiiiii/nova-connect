# Third-party software

NOVA Connect includes open-source dependencies governed by their own licenses.
Those licenses are not replaced by the proprietary NOVA Connect license.

For every sale candidate, run:

```bash
npm run package:sale
```

The generated delivery folder contains:

- `sbom.cdx.json`, a CycloneDX software bill of materials;
- `third-party-licenses.csv`, an inventory derived from the lockfile;
- `SHA256SUMS.txt`, integrity checksums;
- the clean source archive and release manifest.

The seller and buyer must review entries marked `UNKNOWN`, packages with
copyleft or non-standard terms, and all bundled fonts, icons, images, and other
non-package assets before signing. No generated inventory is a substitute for
legal review.
