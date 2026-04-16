class InputNode:
    """Handle user input collection and store normalized input in shared state."""

    def __init__(self, state):
        """Keep a reference to the mutable conversation state."""
        self.state = state

    def process_input(self):
        """Read a text message from the console and update the current state."""
        user_input = input("You: ").strip()

        # Ignore empty submissions so downstream nodes only receive valid content.
        if not user_input:
            return None

        # Allow a clean manual exit during local interactive testing.
        if user_input.lower() in ["exit", "quit"]:
            raise KeyboardInterrupt("Exiting the chat.")

        self.update_state(user_input)
        return user_input

    def process_speech(self, audio_data):
        """Convert incoming audio to text and save the transcript when available."""
        transcript = self.convert_speech_to_text(audio_data)
        if transcript:
            self.update_state(transcript)
        return transcript

    def convert_speech_to_text(self, audio_data):
        """Placeholder speech-to-text hook for future provider integration."""
        # Replace this stub with a real STT service call when voice input is enabled.
        return "transcribed text from audio"

    def update_state(self, transcript):
        """Persist the latest user transcript into the shared node state."""
        self.state["user_input"] = transcript