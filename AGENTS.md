# AGENTS.md

Global standards for all projects under `/Users/forerofamily/Documents/David/_applications`.

## Core principles
- `LEAN-first` is mandatory.
- `KISS` is mandatory.
- Choose the lightest valid solution for the real need.
- Do not introduce a custom app stack if static files are enough.
- Do not introduce a custom app stack if a CMS solves the actual content need.
- Do not add complexity, tooling, services, or automation without clear value.
- Avoid overengineering.
- Prefer solutions that are simple, readable, and maintainable over clever or highly customized solutions.
- Do not build infrastructure, abstractions, or extensibility before there is a real need.
- Reuse what already works before inventing a new pattern.
- Optimize for long-term maintainability, not short-term technical excitement.
- Prefer solutions that reduce the future cost of change.
- Favor technical choices that remain easy to modify, extend, and hand over over time.
- Prefer one clear way of doing things over multiple competing patterns.
- Fix root causes when possible, not only symptoms.
- Keep the operating model realistic for the team that will maintain the project.
- Do not accept a technically impressive solution if it is harder to operate, explain, or hand over.

## Source of truth
- `Notion` is the source of truth for product context, requirements, and technical classification.
- The project Notion page must define `Product Level / Blueprint` in `7. Tech Architecture`.
- The page `Product Qualification & Technical Blueprints` defines what each level and blueprint implies technically.
- Markdown files in projects must not duplicate information already maintained in Notion.

## Working hierarchy
1. Apply this global `AGENTS.md`.
2. Apply the project-level `AGENTS.md` if one exists.
3. Read the project Notion page.
4. Apply the `Product Level / Blueprint` defined there.
5. Execute the current task.

## Project rules
- Each Codex project should point to one project folder only.
- Do not work from `_applications` as the main project workspace for implementation.
- Use `_applications` only as the common parent for shared standards.

## Technical decision rule
- Do not choose the stack freely project by project.
- First read the assigned `Product Level / Blueprint` in Notion.
- Then apply the corresponding technical direction.
- Any exception must be explicit and justified.

## Lemanus Wave technical rule
- Follow `tech-ops.md` for the current local development and production deployment model.
- Current MVP direction is a static web app: no Docker, no production Node.js runtime, no database, no authentication, and no backend unless the product scope changes.
- Production deployment should use Git pull on Infomaniak, build on Infomaniak, and serve the generated static `dist/` output.
- Reassess the Notion `Product Level / Blueprint` before introducing accounts, SQL, backend APIs, Docker, or a heavier runtime.

## Documentation rule
- Keep repository documentation short and operational.
- Put product decisions in Notion.
- Put only local implementation rules, runtime rules, and project-specific exceptions in project files.
- Do not duplicate product context, blueprint definitions, or product requirements in repository Markdown.

## Delivery mindset
- Prefer stable and repeatable solutions over ad hoc solutions.
- Keep implementation choices consistent with the selected blueprint.
- Do not introduce a heavier technical level than the project actually needs.
- If two options work, choose the simpler one to build, run, and maintain.

## In case of doubt
- Return to Notion.
- Verify `Product Level / Blueprint`.
- Choose the simplest viable option.
