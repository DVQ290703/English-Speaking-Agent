# tests/test_grammar_parser/test_annotated_grammar.py
import os
os.environ.setdefault("JWT_SECRET_KEY", "test-secret")
os.environ.setdefault("POSTGRES_PASSWORD", "test-password")
os.environ.setdefault("GROQ_API_KEY", "test-groq-key")
os.environ.setdefault("ELEVENLABS_API_KEY", "test-el-key")


class TestSplitCombinedOutput:
    def _call(self, raw):
        from app.services.grammar_parser import split_combined_output
        return split_combined_output(raw)

    def test_splits_response_and_grammar(self):
        raw = '<response>\nHello!\n</response>\n<grammar>\n{"ann":"x","err":[],"score":100}\n</grammar>'
        text, gram = self._call(raw)
        assert text == "Hello!"
        assert gram == '{"ann":"x","err":[],"score":100}'

    def test_missing_response_tag_returns_full_raw(self):
        raw = "Hello there no tags here"
        text, gram = self._call(raw)
        assert text == raw
        assert gram is None

    def test_missing_grammar_tag_returns_none(self):
        raw = "<response>Hello!</response>"
        text, gram = self._call(raw)
        assert text == "Hello!"
        assert gram is None

    def test_strips_whitespace_from_both_sections(self):
        raw = "<response>  Hi  </response><grammar>  {}  </grammar>"
        text, gram = self._call(raw)
        assert text == "Hi"
        assert gram == "{}"

    def test_multiline_response_preserved(self):
        raw = "<response>Line one.\nLine two.</response><grammar>{}</grammar>"
        text, gram = self._call(raw)
        assert text == "Line one.\nLine two."

    def test_splits_response_grammar_and_suggestions(self):
        from app.services.grammar_parser import split_combined_output_with_suggestions

        raw = (
            "<response>Nice answer.</response>"
            '<grammar>{"ann":"I like hiking.","err":[],"score":100}</grammar>'
            '<suggestions>{"suggestions":["I usually hike on weekends.","What trails do you recommend?","In my experience, hiking helps me clear my head."]}</suggestions>'
        )

        text, grammar, suggestions = split_combined_output_with_suggestions(raw)

        assert text == "Nice answer."
        assert grammar == '{"ann":"I like hiking.","err":[],"score":100}'
        assert suggestions == [
            "I usually hike on weekends.",
            "What trails do you recommend?",
            "In my experience, hiking helps me clear my head.",
        ]

    def test_missing_suggestions_returns_empty_list(self):
        from app.services.grammar_parser import split_combined_output_with_suggestions

        raw = '<response>Hello!</response><grammar>{"ann":"x","err":[],"score":100}</grammar>'

        assert split_combined_output_with_suggestions(raw) == (
            "Hello!",
            '{"ann":"x","err":[],"score":100}',
            [],
        )

    def test_malformed_suggestions_returns_empty_list(self):
        from app.services.grammar_parser import split_combined_output_with_suggestions

        raw = "<response>Hello!</response><suggestions>not json</suggestions>"

        assert split_combined_output_with_suggestions(raw) == ("Hello!", None, [])

    def test_non_list_suggestions_returns_empty_list(self):
        from app.services.grammar_parser import split_combined_output_with_suggestions

        raw = '<response>Hello!</response><suggestions>{"suggestions":"ask more"}</suggestions>'

        assert split_combined_output_with_suggestions(raw) == ("Hello!", None, [])

    def test_more_than_three_suggestions_keeps_first_three(self):
        from app.services.grammar_parser import split_combined_output_with_suggestions

        raw = (
            "<response>Hello!</response>"
            '<suggestions>{"suggestions":["one","two","three","four"]}</suggestions>'
        )

        assert split_combined_output_with_suggestions(raw) == ("Hello!", None, ["one", "two", "three"])

    def test_missing_response_tag_strips_grammar_and_suggestions_blocks(self):
        from app.services.grammar_parser import split_combined_output_with_suggestions

        raw = (
            "Hello outside tags"
            '<grammar>{"ann":"x","err":[],"score":100}</grammar>'
            '<suggestions>{"suggestions":["one"]}</suggestions>'
        )

        assert split_combined_output_with_suggestions(raw) == (
            "Hello outside tags",
            '{"ann":"x","err":[],"score":100}',
            ["one"],
        )


class TestParseAnnotatedGrammar:
    def _call(self, grammar_raw, user_input=""):
        from app.services.grammar_parser import parse_annotated_grammar
        return parse_annotated_grammar(grammar_raw, user_input)

    def test_none_returns_empty_grammar_data(self):
        result = self._call(None, "hello")
        assert result.errors == []
        assert result.overall_score == 100
        assert result.corrected_sentence is None

    def test_no_errors_returns_empty_errors(self):
        raw = '{"ann":"I went to school yesterday.","err":[],"score":100}'
        result = self._call(raw, "I went to school yesterday.")
        assert result.errors == []
        assert result.overall_score == 100
        assert result.corrected_sentence == "I went to school yesterday."

    def test_single_substitution_positions(self):
        raw = '{"ann":"yesterday, i {go->went} to the cinema","err":[{"cat":"vt","sev":2,"msg":"Past simple required."}],"score":78}'
        result = self._call(raw, "yesterday, i go to the cinema")
        assert len(result.errors) == 1
        e = result.errors[0]
        assert e.original == "go"
        assert e.corrected == "went"
        assert e.start_char == 13
        assert e.end_char == 15

    def test_single_substitution_fields(self):
        raw = '{"ann":"{go->went}","err":[{"cat":"vt","sev":2,"msg":"Past simple required.","eg":"I went yesterday."}],"score":78}'
        result = self._call(raw, "go")
        e = result.errors[0]
        assert e.category == "verb_tense"
        assert e.severity == "major"
        assert e.explanation == "Past simple required."
        assert e.example == "I went yesterday."

    def test_corrected_sentence_derived_from_ann(self):
        raw = '{"ann":"i {go->went} to {cinema->the cinema}","err":[{"cat":"vt","sev":2,"msg":"Past."},{"cat":"art","sev":1,"msg":"Article."}],"score":70}'
        result = self._call(raw, "i go to cinema")
        assert result.corrected_sentence == "i went to the cinema"

    def test_two_same_word_errors_cursor_advances(self):
        raw = '{"ann":"{go->went} and {go->goes} later","err":[{"cat":"vt","sev":2,"msg":"Past."},{"cat":"vt","sev":1,"msg":"Agreement."}],"score":70}'
        result = self._call(raw, "go and go later")
        assert result.errors[0].start_char == 0
        assert result.errors[0].end_char == 2
        assert result.errors[1].start_char == 7
        assert result.errors[1].end_char == 9

    def test_insertion_zero_width_span(self):
        raw = '{"ann":"{->I} went","err":[{"cat":"sv","sev":2,"msg":"Missing subject."}],"score":75}'
        result = self._call(raw, "went")
        assert result.errors[0].original == ""
        assert result.errors[0].corrected == "I"
        assert result.errors[0].start_char == 0
        assert result.errors[0].end_char == 0

    def test_deletion_marks_span(self):
        raw = '{"ann":"I {really->} went","err":[{"cat":"wc","sev":1,"msg":"Remove filler."}],"score":95}'
        result = self._call(raw, "I really went")
        e = result.errors[0]
        assert e.original == "really"
        assert e.corrected == ""
        assert e.start_char == 2
        assert e.end_char == 8

    def test_case_insensitive_search(self):
        raw = '{"ann":"{Go->Went}","err":[{"cat":"vt","sev":2,"msg":"Past simple."}],"score":80}'
        result = self._call(raw, "Go to school")
        assert result.errors[0].start_char == 0
        assert result.errors[0].end_char == 2

    def test_annotation_count_greater_than_errors_uses_min(self):
        raw = '{"ann":"{go->went} {a->the}","err":[{"cat":"vt","sev":2,"msg":"Past."}],"score":80}'
        result = self._call(raw, "go a")
        assert len(result.errors) == 1

    def test_malformed_json_returns_empty(self):
        result = self._call("not json at all", "hello")
        assert result.errors == []

    def test_category_code_expansion(self):
        codes = {
            "vt": "verb_tense", "art": "article", "prep": "preposition",
            "sv": "subject_verb_agreement", "sp": "spelling", "wc": "word_choice",
            "punc": "punctuation", "wo": "word_order", "pl": "plural_singular",
            "other": "other",
        }
        for code, expected in codes.items():
            raw = f'{{"ann":"{{x->y}}","err":[{{"cat":"{code}","sev":1,"msg":"x"}}],"score":90}}'
            result = self._call(raw, "x")
            assert result.errors[0].category == expected, f"Failed for code={code}"

    def test_severity_int_expansion(self):
        for sev_int, expected in [(1, "minor"), (2, "major"), (3, "critical")]:
            raw = f'{{"ann":"{{x->y}}","err":[{{"cat":"other","sev":{sev_int},"msg":"x"}}],"score":90}}'
            result = self._call(raw, "x")
            assert result.errors[0].severity == expected

    def test_unknown_category_code_passes_through(self):
        raw = '{"ann":"{x->y}","err":[{"cat":"xyz","sev":1,"msg":"x"}],"score":90}'
        result = self._call(raw, "x")
        assert result.errors[0].category == "xyz"

    def test_optional_eg_field_absent(self):
        raw = '{"ann":"{go->went}","err":[{"cat":"vt","sev":2,"msg":"Past simple."}],"score":80}'
        result = self._call(raw, "go")
        assert result.errors[0].example == ""

    def test_score_preserved(self):
        raw = '{"ann":"good sentence","err":[],"score":95}'
        result = self._call(raw, "good sentence")
        assert result.overall_score == 95
