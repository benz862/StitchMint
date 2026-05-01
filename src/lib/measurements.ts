export function finishedSizeInches(widthStitches: number, heightStitches: number, fabricCount: number) {
  return {
    widthIn: widthStitches / fabricCount,
    heightIn: heightStitches / fabricCount,
  };
}

export function inchesToCm(inches: number) {
  return inches * 2.54;
}

export function recommendedFabricCut(widthIn: number, heightIn: number, marginIn = 6) {
  return {
    widthIn: Math.ceil(widthIn + marginIn * 2),
    heightIn: Math.ceil(heightIn + marginIn * 2),
  };
}
