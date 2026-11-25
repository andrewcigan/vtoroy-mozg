# Step 2 — Access: `ssh iva` from the person's computer

Goal: `ssh iva` opens a shell as user `iva` on the server, by key, with no password and no questions, from macOS and
Windows alike.

## 2.1 Key (once per computer)

- macOS/Linux: `test -f ~/.ssh/iva_ed25519 || ssh-keygen -q -t ed25519 -N '' -C "iva-$(hostname)" -f ~/.ssh/iva_ed25519`
- Windows: `if (!(Test-Path $env:USERPROFILE\.ssh\iva_ed25519)) { ssh-keygen -q -t ed25519 -N '""' -f $env:USERPROFILE\.ssh\iva_ed25519 }`,
  then `icacls $env:USERPROFILE\.ssh\iva_ed25519 /inheritance:r /grant:r "$($env:USERNAME):F"` — Windows OpenSSH refuses
  a private key other users can read ("UNPROTECTED PRIVATE KEY FILE").

## 2.2 Already in?

The server bans an address after 5 failed logins in 10 minutes for 1 hour (fail2ban). Every key ssh offers and the server
refuses counts as a failure. So: at most 3 login attempts per run, always with `-o IdentitiesOnly=yes` (otherwise ssh
offers every key it knows and one attempt can burn the whole budget), and only these candidates, in order:

1. `ssh -o BatchMode=yes -o ConnectTimeout=8 iva` if a `Host iva` block exists;
2. `~/.ssh/iva_ed25519` as `iva@<IP>`;
3. a key named by an `IdentityFile` line in a `~/.ssh/config` block whose `HostName` is this IP.

Works → that key is the person's key from an earlier install: use it as `IdentityFile` in 2.4 and skip to 2.4. Never try
other keys from `~/.ssh` one by one.

Port 22 starts refusing connections right after failed logins → the address is banned for up to 1 hour. Stop, tell the
person, and offer: wait an hour, or unban from the hosting provider's web console (`fail2ban-client set sshd unbanip
<their IP>`). Do not keep connecting — each attempt during a ban can extend it.

Host key changed ("REMOTE HOST IDENTIFICATION HAS CHANGED"): the server was reinstalled — ask the person before
`ssh-keygen -R <IP>`.

## 2.3 First login as root with the hosting password

1. Try a non-interactive password login (OpenSSH ≥ 8.4, `references/secrets.md`) and put the public key into
   `/root/.ssh/authorized_keys`.
2. Many hosts (Hetzner) force a password change on first login: "Password change required but no TTY available". A tool
   without a terminal cannot pass it reliably. Ask the person to do one login themselves and give them two commands to
   paste into Terminal (macOS) or PowerShell (Windows):
   - `ssh root@<IP>` — type the password from the email, then a new password twice; the connection closes;
   - `ssh root@<IP> "mkdir -p ~/.ssh && echo '<contents of iva_ed25519.pub>' >> ~/.ssh/authorized_keys"` — type the new
     password once.
   This way the model never sees the new password. Then check `ssh -o BatchMode=yes -i <key> root@<IP> true`.

## 2.3a First login with a key file (Tencent Cloud Lighthouse, AWS and others)

The host gave a private key file (`.pem`, `.key`) instead of a password; the login may be `ubuntu`, `debian` or `root`.

1. Move the file out of the project and Downloads into `~/.ssh/iva_server_key`; `chmod 600` (Windows: `icacls` as in 2.1,
   with this file's path). Never print its contents. `PPK` (first line `PuTTY-User-Key-File`) → ask for the OpenSSH/PEM file.
2. Find the login without asking: `ssh -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=8 -i ~/.ssh/iva_server_key
   <login>@<IP> 'id -un; sudo -n true && echo SUDO'` for `ubuntu`, then `root` (two attempts; the key was bound to the
   server in the host panel — "Permission denied" on both means it is not bound or belongs to another server: say so, stop).
3. Login is not root but `SUDO` is printed: run every "as root" command of step 3 through `sudo`. Do not open root login and
   do not set a root password. `scp` to `/tmp/`, then `sudo mv` it to `/root/`; `cat > /root/iva-pass` becomes
   `sudo sh -c 'umask 077; cat > /root/iva-pass'`; bootstrap:
   `sudo IVA_USER=iva IVA_PASS="$(sudo cat /root/iva-pass)" … bash /root/bootstrap.sh --non-interactive`.
   No `SUDO` → stop and tell the person.
4. Make the person's own key (2.1) and pass it as `IVA_PUBKEY`; the host's key stays for the original login as a spare.
   Keep that session open until `ssh -o BatchMode=yes iva true` works.

## 2.4 The short name

Add this block to `~/.ssh/config` (Windows: `$env:USERPROFILE\.ssh\config`) if no `Host iva` exists; if one exists with
another HostName, ask before changing it:

```
Host iva
  HostName <IP>
  User iva
  IdentityFile ~/.ssh/iva_ed25519
  IdentitiesOnly yes
  ServerAliveInterval 30
```

Before step 3 the `iva` user may not exist yet — keep using `root@<IP>` with the key until bootstrap creates it, then
check `ssh -o BatchMode=yes iva true` (≤ 5 s, no prompts).
