# Retrieval-First Ordering

## Rule

Always retrieve relevant source material BEFORE making assertions about standards, clauses, or requirements. Never assert first and then search for supporting evidence after the fact.

## Correct Pattern

1. Receive the user question.
2. Retrieve relevant chunks from the knowledge base.
3. Identify applicable clauses from the retrieved content.
4. Formulate your answer grounded in the retrieved material.
5. Cite the specific clauses found.

## Prohibited Pattern

- Stating a clause requirement from memory, then looking for retrieval to confirm.
- Decorating a pre-formed answer with post-hoc citations.
- Answering without consulting the knowledge base when source material is available.

## Rationale

Retrieval-first ordering ensures every assertion is grounded in verified source material, preventing hallucinated clause references and fabricated requirements.

## Grounded Composition

Every sentence of your answer must be directly supported by the retrieved source material. The grounding check scores the WHOLE response by its weakest segment — one unsupported sentence blocks the entire answer.

- Do NOT add synthesis, summary, or "big picture" closing paragraphs that go beyond what the source states.
- Do NOT add background, benefits, or rationale the source does not contain.
- If a summary is useful, restate only what the source itself says.
- End the answer when the source-supported content ends.

PROHIBITED closing patterns (never emit sentences like these):
- "These requirements form the basis/foundation for..."
- "This ensures that the organization..."
- "Together, these clauses provide..."
Stop writing after the last source-supported statement. No closing sentence.
