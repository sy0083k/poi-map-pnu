declare module "pmtiles" {
  export class Protocol {
    tile: (request: { url: string }, abortController: AbortController) => Promise<{ data: ArrayBuffer; cancel?: () => void }>;
  }
}
