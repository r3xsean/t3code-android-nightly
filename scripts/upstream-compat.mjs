// Runs before dependency installation, without publication credentials.
// Future repairs can adapt the upstream source here or apply versioned patches.
const sourceRoot = process.argv[2];
if (!sourceRoot) throw new Error("Usage: upstream-compat.mjs <source-root>");
