// jsqr ships no types and has no @types package — minimal ambient
// declaration covering the one export the Verify Document flow uses
// (SignVerifyPage.tsx's client-side QR decode from an uploaded/rasterized
// page image).
declare module 'jsqr' {
  interface QRCodePoint { x: number; y: number; }
  interface QRCodeLocation {
    topRightCorner: QRCodePoint;
    topLeftCorner: QRCodePoint;
    bottomRightCorner: QRCodePoint;
    bottomLeftCorner: QRCodePoint;
    topRightFinderPattern: QRCodePoint;
    topLeftFinderPattern: QRCodePoint;
    bottomLeftFinderPattern: QRCodePoint;
  }
  interface QRCode {
    binaryData: number[];
    data: string;
    chunks: unknown[];
    version: number;
    location: QRCodeLocation;
  }
  interface Options {
    inversionAttempts?: 'dontInvert' | 'onlyInvert' | 'attemptBoth' | 'invertFirst';
  }
  function jsQR(data: Uint8ClampedArray, width: number, height: number, options?: Options): QRCode | null;
  export default jsQR;
}
