import { detector, windowSize, type Reading } from "./pitch";

// Reads the pitch of a source once per animation frame, with the audio clock's time in seconds.
// Call the returned function to stop. The AudioContext is created before the first await so
// that Safari ties it to the click.
export async function listen(
  open: Open,
  onReading: (reading: Reading | undefined, time: number) => void,
) {
  const context = new AudioContext();

  // Safari may create it suspended when the click was on a file picker rather than a button.
  void context.resume();

  const source = await open(context);
  const analyser = new AnalyserNode(context, { fftSize: windowSize });
  const detect = detector(context.sampleRate);
  const samples = new Float32Array(windowSize);

  source.node.connect(analyser);

  function read() {
    analyser.getFloatTimeDomainData(samples);
    onReading(detect(samples), context.currentTime);
    frame = requestAnimationFrame(read);
  }

  let frame = requestAnimationFrame(read);

  return () => {
    cancelAnimationFrame(frame);
    source.stop();
    void context.close();
  };
}

// The microphone, with the browser's voice processing off: it distorts instrument sound.
export async function microphone(context: AudioContext): Promise<Source> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });

  return {
    node: context.createMediaStreamSource(stream),
    stop: () => stream.getTracks().forEach((track) => track.stop()),
  };
}

// A recorded file, played through the speakers while it is read.
export function recording(file: File) {
  return async (context: AudioContext): Promise<Source> => {
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    const node = new AudioBufferSourceNode(context, { buffer });

    node.connect(context.destination);
    node.start();

    return { node, stop: () => node.stop() };
  };
}

interface Source {
  node: AudioNode;
  stop: () => void;
}

type Open = (context: AudioContext) => Promise<Source>;
