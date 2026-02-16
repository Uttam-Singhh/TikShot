/**
 * Patch rpc-websockets for Node.js v24 compatibility.
 *
 * v9.x: Remove exports field (root @solana/web3.js v1.98+ imports from root)
 * v7.x: Create .js shims for all .cjs files so Node resolves them
 */
const fs = require("fs");
const path = require("path");

function createShims(dir) {
  // Create .js shims for every .cjs file in the directory tree
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        createShims(fullPath);
      } else if (entry.name.endsWith(".cjs")) {
        const jsPath = fullPath.replace(/\.cjs$/, ".js");
        if (!fs.existsSync(jsPath)) {
          const relCjs = "./" + entry.name;
          fs.writeFileSync(jsPath, `module.exports = require("${relCjs}");\n`);
        }
      }
    }
  } catch {}
}

function patchPkg(dir) {
  const pkgPath = path.join(dir, "package.json");
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    const ver = pkg.version || "";

    if (ver.startsWith("9.") && pkg.exports) {
      delete pkg.exports;
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
      console.log(`Patched rpc-websockets v${ver}: removed exports (${dir})`);
    }

    if (ver.startsWith("7.")) {
      const distDir = path.join(dir, "dist");
      if (fs.existsSync(distDir)) {
        createShims(distDir);
        console.log(`Patched rpc-websockets v${ver}: created .js shims (${dir})`);
      }
    }
  } catch {}
}

function findRpcWs(base, depth) {
  if (depth > 6) return;
  const rpcWsDir = path.join(base, "node_modules", "rpc-websockets");
  if (fs.existsSync(path.join(rpcWsDir, "package.json"))) {
    patchPkg(rpcWsDir);
  }

  try {
    const nmDir = path.join(base, "node_modules");
    for (const entry of fs.readdirSync(nmDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name === ".cache") continue;

      if (entry.name.startsWith("@")) {
        try {
          for (const s of fs.readdirSync(path.join(nmDir, entry.name), { withFileTypes: true })) {
            if (s.isDirectory()) {
              findRpcWs(path.join(nmDir, entry.name, s.name), depth + 1);
            }
          }
        } catch {}
      } else {
        findRpcWs(path.join(nmDir, entry.name), depth + 1);
      }
    }
  } catch {}
}

findRpcWs(path.join(__dirname, ".."), 0);
