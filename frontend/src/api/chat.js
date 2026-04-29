const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export async function chatRespond({
  token,
  text,
  audioBlob,
  history = [],
  topic = '',
  voiceGender = '',
}) {
  const formData = new FormData();

  if (text && text.trim()) {
    formData.append('text', text.trim());
  }

  if (Array.isArray(history) && history.length > 0) {
    formData.append('history', JSON.stringify(history));
  }

  if (topic && topic.trim()) {
    formData.append('topic', topic.trim());
  }

  if (voiceGender && voiceGender.trim()) {
    formData.append('voice_gender', voiceGender.trim());
  }

  if (audioBlob) {
    formData.append('audio_file', audioBlob, 'recording.webm');
  }

  const response = await fetch(`${API_BASE_URL}/api/chat/respond`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || 'Chat request failed');
  }

  return data;
}

function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // 16-bit
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

export async function toWav(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx = new AudioContext({ sampleRate: 16000 });
  try {
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const wavBuffer = encodeWav(audioBuffer.getChannelData(0), 16000);
    return new Blob([wavBuffer], { type: 'audio/wav' });
  } finally {
    await audioCtx.close();
  }
}

export async function assessPronunciation({
  token,
  audioBlob,
  referenceText = null,
  language = null,
}) {
  const wavBlob = await toWav(audioBlob);
  const formData = new FormData();
  formData.append('audio_file', wavBlob, 'recording.wav');

  if (referenceText && referenceText.trim()) {
    formData.append('reference_text', referenceText.trim());
  }

  if (language && language.trim()) {
    formData.append('language', language.trim());
  }

  const response = await fetch(`${API_BASE_URL}/api/assess`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || 'Assessment request failed');
  }

  return data;
}
