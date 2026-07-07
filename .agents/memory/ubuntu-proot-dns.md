---
name: Ubuntu proot DNS fix
description: Why git cannot resolve hosts inside proot on Ubuntu 22.04 and how to fix it
---

## The problem
Ubuntu 22.04's /etc/resolv.conf is a **symlink** to `../run/systemd/resolve/stub-resolv.conf` (nameserver 127.0.0.53).
systemd-resolved is not running in proot, so all glibc DNS queries fail.
curl works because it uses c-ares (its own resolver). git fails because it uses glibc NSS.
Also, nsswitch.conf has `mdns4_minimal [NOTFOUND=return]` which short-circuits glibc before real nameservers.

## Java-side fix (ProcessManager.ensureResolvConf)
`File.exists()` follows symlinks — it returned true and skipped writing.
Use `Files.isSymbolicLink(path)` to detect it, delete the symlink, then write a real file.

## Inline fix (inside proot command, belt-and-suspenders)
```bash
rm -f /etc/resolv.conf && printf 'nameserver 8.8.8.8\nnameserver 8.8.4.4\n' > /etc/resolv.conf && sed -i 's/mdns4_minimal \[NOTFOUND=return\] //g' /etc/nsswitch.conf
```
Use `&&` (not `;`) so the installer only runs after the DNS prep succeeds.

**Why:** The bind-mount `--bind=configDir/resolv.conf:/etc/resolv.conf` cannot override a broken symlink target inside proot. Both layers of fix are needed.
