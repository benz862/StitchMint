import styles from "./PdfPreviewCard.module.css";

/**
 * Decorative “pattern PDF” card for the marketing hero — not a real PDF render.
 * Styles match the provided PDF preview spec (PdfPreviewCard.module.css).
 */
export default function PdfPreviewCard() {
  const legend = [
    { dmc: "223", hex: "#e88f8f" },
    { dmc: "224", hex: "#f6b1a5" },
    { dmc: "3726", hex: "#b99578" },
    { dmc: "931", hex: "#87a684" },
    { dmc: "989", hex: "#5e6b57" },
    { dmc: "310", hex: "#333333" },
  ];

  return (
    <div className={styles.pdfCard} aria-hidden>
      <div className={styles.pdfBadge}>PDF</div>

      <h2>Forever Together</h2>
      <p className={styles.subtitle}>CROSS-STITCH PATTERN</p>

      <div className={styles.decorLine}>
        <span />
        <strong aria-hidden>♥</strong>
        <span />
      </div>

      <div className={styles.patternGrid}>
        <div className={styles.patternArt}>
          <div className={styles.couple} />
        </div>

        <div className={styles.legend}>
          <h4>DMC</h4>
          {legend.map((row) => (
            <p key={row.dmc}>
              <i style={{ background: row.hex }} />
              {row.dmc}
            </p>
          ))}
        </div>
      </div>

      <div className={styles.pdfInfo}>
        <div>
          <span aria-hidden>▦</span>
          <strong>STITCH COUNT</strong>
          <small>73 × 73</small>
        </div>
        <div>
          <span aria-hidden>▥</span>
          <strong>FABRIC</strong>
          <small>14 count Aida</small>
        </div>
        <div>
          <span aria-hidden>▣</span>
          <strong>SIZE</strong>
          <small>13.2 × 13.2 cm</small>
        </div>
      </div>
    </div>
  );
}
