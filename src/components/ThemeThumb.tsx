import { FONTS, PAPER_COLORS, type CookbookTheme } from "@/lib/pdf/theme";

/**
 * Miniature d'une page de recette dessinée avec les couleurs, la police et la
 * disposition du thème (sans générer de PDF).
 */
export function ThemeThumb({
  config,
  width = 64,
}: {
  config: CookbookTheme;
  width?: number;
}) {
  const h = Math.round(width * 1.414);
  const a = config.accentColor;
  const paper = PAPER_COLORS[config.paper] ?? "#ffffff";
  const ink = config.textColor;
  const s = width / 64;
  const stacked =
    config.recipeLayout === "moderne" ||
    config.recipeLayout === "fiche-technique" ||
    config.ingredientsPosition === "top";
  const ingRight = !stacked && config.ingredientsPosition === "right";
  const align =
    config.titleAlign !== "auto"
      ? config.titleAlign
      : config.recipeLayout === "classique"
        ? "center"
        : "left";
  const bg =
    config.paper === "grid"
      ? `linear-gradient(#e6ebf2 1px, transparent 1px) 0 0/${5 * s}px ${5 * s}px, linear-gradient(90deg,#e6ebf2 1px, transparent 1px) 0 0/${5 * s}px ${5 * s}px, #fff`
      : config.paper === "lined"
        ? `repeating-linear-gradient(#fffef8 0 ${5 * s}px, #dfe7f1 ${5 * s}px ${5.6 * s}px)`
        : paper;

  const line = (w: string, color = ink, op = 0.28, hh = 2) => (
    <div style={{ width: w, height: hh * s, borderRadius: 2, background: color, opacity: op, marginBottom: 2.2 * s }} />
  );

  const ingCol = (
    <div style={{ flex: stacked ? "none" : "0 0 40%", minWidth: 0 }}>
      <div style={{ width: "60%", height: 2.4 * s, background: a, borderRadius: 2, marginBottom: 3 * s }} />
      {line("90%")}
      {line("75%")}
      {line("85%")}
      {line("60%")}
    </div>
  );
  const prepCol = (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ width: "50%", height: 2.4 * s, background: a, borderRadius: 2, marginBottom: 3 * s }} />
      {line("100%")}
      {line("95%")}
      {line("100%")}
      {line("70%")}
    </div>
  );

  return (
    <div
      aria-hidden
      style={{
        width,
        height: h,
        flex: "none",
        borderRadius: 4 * s,
        background: bg,
        position: "relative",
        overflow: "hidden",
        boxShadow: "0 0 0 1px rgba(0,0,0,.25), 0 6px 16px rgba(0,0,0,.3)",
        padding: `${8 * s}px ${7 * s}px`,
      }}
    >
      {config.pageFrame === "band" && <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 4 * s, background: a }} />}
      {config.pageFrame === "side" && <div style={{ position: "absolute", left: 3 * s, top: 0, bottom: 0, width: 1.5 * s, background: a }} />}
      {(config.pageFrame === "line" || config.pageFrame === "double") && (
        <div style={{ position: "absolute", inset: 3 * s, border: `${config.pageFrame === "double" ? 2.5 * s : 1 * s}px ${config.pageFrame === "double" ? "double" : "solid"} ${a}`, opacity: 0.8 }} />
      )}
      {config.pageFrame === "corners" && (
        <>
          <div style={{ position: "absolute", left: 3 * s, top: 3 * s, width: 8 * s, height: 8 * s, borderLeft: `${s}px solid ${a}`, borderTop: `${s}px solid ${a}` }} />
          <div style={{ position: "absolute", right: 3 * s, bottom: 3 * s, width: 8 * s, height: 8 * s, borderRight: `${s}px solid ${a}`, borderBottom: `${s}px solid ${a}` }} />
        </>
      )}
      <div
        style={{
          fontFamily: (FONTS[config.titleFont] ?? FONTS.arial).family,
          fontSize: 7.5 * s,
          fontWeight: 700,
          lineHeight: 1.1,
          color: config.titleStyle === "band" ? "#fff" : a,
          background: config.titleStyle === "band" ? a : undefined,
          padding: config.titleStyle === "band" ? `${1.5 * s}px ${2 * s}px` : undefined,
          borderRadius: 1.5 * s,
          textAlign: align,
          textTransform: config.titleUppercase || config.recipeLayout === "fiche-technique" ? "uppercase" : undefined,
          whiteSpace: "nowrap",
          overflow: "hidden",
          marginBottom: 2 * s,
        }}
      >
        Recette
      </div>
      {(config.titleStyle === "underline" || config.titleStyle === "ornament") && (
        <div style={{ width: 14 * s, height: s, background: a, margin: align === "center" ? "0 auto" : align === "right" ? "0 0 0 auto" : 0, marginBottom: 4 * s }} />
      )}
      <div
        style={{
          display: "flex",
          flexDirection: stacked ? "column" : ingRight ? "row-reverse" : "row",
          gap: 4 * s,
          marginTop: 3 * s,
        }}
      >
        {ingCol}
        {prepCol}
      </div>
    </div>
  );
}
