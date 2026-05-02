from pydantic import BaseModel, Field


class GrammarErrorOutput(BaseModel):
    cat: str                        # vt, art, prep, sv, sp, wc, punc, wo, pl, other
    sev: int = Field(ge=1, le=3)    # 1=minor  2=major  3=critical
    msg: str                        # one-sentence explanation
    eg: str | None = None           # optional example


class GrammarOutput(BaseModel):
    ann: str                        # annotated sentence with {wrong->correct} markers
    err: list[GrammarErrorOutput]   # parallel to annotation tokens, in order
    score: int = Field(ge=0, le=100)


class AgentOutput(BaseModel):
    response_text: str                               # plain coaching reply, no XML tags
    grammar: GrammarOutput | None = None             # None = no errors found
    suggestions: list[str] = Field(default_factory=list)  # up to 3 next-turn prompts
