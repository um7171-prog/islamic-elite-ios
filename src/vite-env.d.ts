/// <reference types="vite/client" />

declare module "hijri-converter" {
  export function toHijri(gy: number, gm: number, gd: number): { hy: number; hm: number; hd: number };
  export function toGregorian(hy: number, hm: number, hd: number): { gy: number; gm: number; gd: number };
}

declare module "mammoth" {
  const mammoth: {
    extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string; messages: unknown[] }>;
  };
  export default mammoth;
}
