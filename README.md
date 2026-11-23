# Browser assistant: simple project guide

This folder uses the guided Stagehand approach.

The project keeps three features: website browsing, document reading, and feedback-form preparation. The agent prepares the form, then you edit and submit directly in the same browser. No terminal approval is required.

## Shared files and jobs

Both versions keep these filenames. Their jobs are the same, even where the browser adapters differ.

| File in src/ | Job |
| --- | --- |
| agent.mjs | General browsing: ask the model for a browser action, check it, run it, and read the result. |
| safety.mjs | Check the browsing agent's requested tools and addresses. |
| nauip.mjs | Connect to the existing AI service and handle model responses/retries. |
| ocr-pdf.mjs | Read document options, optionally ask a question, and save reports. |
| ocr.mjs | Read PDF text directly; use the image reader for scanned pages. |
| captcha.mjs | Calculate supported arithmetic or validate recognized letters/digits. Never submits. |
| captcha-ocr.mjs | Send only the challenge image to the image-reading model. |
| review-session.mjs | Keep the page open for your edits and finish when you close it. |

## Files that differ

| Job | Direct version | Guided version |
| --- | --- | --- |
| Coordinate the form | nmc-form.mjs | stagehand-form.mjs |
| Fill and check fields | nmc-session.mjs and form-schema.mjs | nmc-form.mjs |
| Supply starting answers | forms/answers.json and forms/fields.json | Default answers and field descriptions in src/nmc-form.mjs |
| Enter the CAPTCHA | Direct browser operations in captcha.mjs | stagehand-captcha.mjs uses guided actions |
| Convert browser decisions into AI requests | Not needed for form actions | stagehand-model.mjs |
| Repair the installed browser helper's Space-key issue | Not needed | stagehand-runtime-compat.mjs — required for the installed version |

Direct filling follows known addresses and actions, so it is generally faster for this fixed form. Guided filling asks a model how to perform each requested action and separately reads answers with the model. Both check real control values before handing over the page. Neither changes your answers after handoff.

## Workflow

- Browsing: your task -> model -> checked browser action -> page result -> model answer.
- Documents: PDF -> selectable text, or image recognition for scanned pages -> saved report. A question/summary adds an answer-model request.
- Forms: starting answers -> fill -> verify -> consent and CAPTCHA -> your edits -> your own Submit click.

### CAPTCHA examples

For readable math such as **5 + 2 =**, both versions read the expression and calculate **7** locally. Direct filling types 7 immediately. Guided filling asks its action model to enter the already-calculated 7. The model does not choose the math answer.

For an image showing **EgXFW8**, both versions send the original and enlarged challenge crop to Chandra, compare the readings, preserve case and fill the agreed text. The Direct version enters it through Playwright; the guided version enters it through an action call. Unclear/disagreeing readings may require correction on the open page. This is not a universal CAPTCHA recognizer; the website decides whether the answer is accepted.

## Where models are called

| Feature | Calls made |
| --- | --- |
| General browsing, both versions | agent.mjs calls the browsing model through nauip.mjs during its action/result rounds. |
| Existing PDF text | No model call for extracting selectable text. |
| Scanned PDF page | ocr.mjs calls the configured image-reading model through nauip.mjs. |
| Document question/summary | ocr-pdf.mjs calls the answer model after extraction. |
| Direct form filling and visible math | No language-model call. |
| Guided form filling | act() requests action decisions; extract() requests supplementary answer reviews. stagehand-model.mjs sends those requests to the service. Dropdowns can need several actions. |
| Image CAPTCHA, both versions | captcha-ocr.mjs calls the configured Chandra image reader. Chandra is itself an AI model, used here for transcription. |

The guided version normally works from page structure/text, not a saved PNG for every action. Screenshots are saved for review and captured when image recognition is needed.

## What to keep

- src/: the runtime code listed above.
- forms/: only the Direct version's two required starting-data files.
- .env: your private working settings; never share its real key.
- package.json and package-lock.json: commands and exact dependency versions.
- node_modules/: installed libraries required to run; restore with npm ci if needed.
- .gitignore: keeps private settings, answers and generated output out of Git.
- README.md: this guide. .git/ is retained to protect existing version history.

artifacts/ and browser-output folders are generated again when needed. They are output, not source to study. Old output, tests, examples, diagnostics and duplicate guides were archived outside both projects before removal. Your real .env, dependencies and Git history were not deleted. Tests are useful during development but are not required to run the application; their temporary verification copies are outside the simplified projects.

## Main commands

Run these from the chosen project folder. Replace PDF_URL with a supported document link.

| Command | Purpose |
| --- | --- |
| npm run form | Prepare the form; edit and submit on the page. |
| npm run form:check | Hidden fill-only check; never enables submission. |
| npm start -- "YOUR TASK" | Browse/read a website. |
| npm run models | List model names available from your configured service. |
| npm run ocr -- "PDF_URL" | Extract a supported document. |
| npm run ocr -- --ask "Summarise this document" "PDF_URL" | Extract it and request a summary. |
| npm run ocr -- --max-pages 5 "PDF_URL" | Limit document processing to five pages. |
| npm run form -- --data "answers.json" | Use different starting answers. Browser edits remain possible. |
| npm run form -- --manual-captcha | Let the person complete the challenge/consent on the page. |
| npm run form -- --help | Show form options. Browsing and document commands also support --help. |
| npm ci | Restore dependency versions from the lockfile. |

The Direct version additionally supports npm run install-browser if its browser needs installing. The guided version uses installed Chrome. Models need valid existing service settings; local arithmetic needs no model request. Document processing defaults to twenty pages and the answer model receives a bounded amount of extracted text. Documents remain limited to the configured public document domain.

Browsing has no fixed step limit. It continues through action/result rounds until the model gives its final answer. Ctrl+C stops a run; connection or model failures are still reported.
