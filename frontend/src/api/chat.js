const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export async function chatRespond({ token, text, audioBlob, history = [], topic = "" }) {
  const formData = new FormData();

  if (text && text.trim()) {
    formData.append("text", text.trim());
  }

  if (Array.isArray(history) && history.length > 0) {
    formData.append("history", JSON.stringify(history));
  }

  if (topic && topic.trim()) {
    formData.append("topic", topic.trim());
  }

  if (audioBlob) {
    formData.append("audio_file", audioBlob, "recording.webm");
  }

  const response = await fetch(`${API_BASE_URL}/api/chat/respond`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || "Chat request failed");
  }

  return data;
}
