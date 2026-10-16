declare module 'soundtouchjs' {
  export class SoundTouch {
    tempo: number;
    pitch: number;
    rate: number;
    pitchSemitones: number;
    process(): void;
    clear(): void;
  }

  export class WebAudioBufferSource {
    constructor(buffer: AudioBuffer);
    position: number;
    extract(target: Float32Array, numFrames?: number, position?: number): number;
  }

  export class SimpleFilter {
    constructor(source: WebAudioBufferSource, pipe: SoundTouch, callback?: () => void);
    sourcePosition: number;
    extract(target: Float32Array, numFrames?: number): number;
  }

  export function getWebAudioNode(
    context: BaseAudioContext,
    filter: SimpleFilter,
    sourcePositionCallback?: (position: number) => void,
    bufferSize?: number,
  ): ScriptProcessorNode;
}
