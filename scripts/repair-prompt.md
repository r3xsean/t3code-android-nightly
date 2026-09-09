# Repair Android nightly delivery

Investigate the supplied failure and restore delivery of the newest T3 Code
nightly. The working directory contains the builder at `builder/`, the exact
upstream source at `upstream/`, and failure evidence. You may propose changes
anywhere in the builder, including build scripts, dependencies, workflows,
tests, and patches to upstream mobile code. Use your judgement to fix the cause.

Keep `scripts/build-repair.sh` representative of the production build: an
independent GitHub workflow uses it to compile the candidate, runs the original
test suite as well as new tests, and checks the resulting APK. That verified
candidate can then be promoted automatically. Changes to the verifier in your
candidate do not change the checks applied to this attempt.

Return the schema's `patch` result with complete replacement contents for all
changed builder files (null content deletes a file), and a concise explanation.
Represent upstream changes as durable builder adaptations or patch files.
If you cannot produce a working repair, return `blocked` with your diagnosis.
The controller handles commits, verification, publication, and duplicate runs.
