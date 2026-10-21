# BLUE BOOK NETWORK feed

Cloudflare Pages: build command `node scripts/build-feed.mjs`, output directory `dist`, production branch `main`, repository root unchanged. No dependencies, API keys, paid APIs or central desktop publisher are required.

The Android app requests `/index.json` (`schemaVersion: 1`) and the relative `articles/{id}.json` paths in that index. The build generates the entire index from `content/approved/*.json`; ChatGPT does not edit the generated index in GitHub. Existing `public` files remain compatibility assets and are not automatically included in the app feed.

Each input is an envelope with `schemaVersion: 1`, `publication` and `article`. `publication` contains state `approved`, kind `article` or `test`, approvedBy and approvedAt. Writing an approved input triggers public publication and requires authorization for that publication. This metadata records the editorial decision; it does not verify identity or authorize an unapproved action. Preserve human editorial approval requirements for real articles.

`article` uses the existing Android v1 schema: id, title, category, reporter, publishedAt, summary, path, body, sources, verification and media. IDs are lowercase slugs and match the filename. Future authorized article additions need only a new input file; no index edit is necessary. Invalid inputs fail the build and keep the prior deployment live.

Only the explicitly named `bbn-app-integration-test-20261021` test fixture is allowed. It is user-authorized, clearly labeled `[연동 테스트]`, and carries a pending verification note. Other test inputs are rejected. Real articles require nonempty sources and verified/partial verification as well as the recorded approval. Approval metadata is not emitted into the public article JSON.

Do not delete or rewrite existing inputs as a retry. Check for an existing ID before adding a file. Monitor the commit-specific Cloudflare check and verify the production `/index.json` and detail JSON after deployment. This change does not create or change any scheduled task.
