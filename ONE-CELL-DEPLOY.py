# ============================================================================
#  AJAY AI ASSISTANT — EK HI CELL SE DEPLOY
# ============================================================================
#  Ye poora code copy karke Google Colab ke EK cell me paste karo aur ▶ dabao.
#  Koi dusra cell chalane ki zaroorat nahi.
#
#  Chahiye:
#    1. ajay-ai-assistant.zip  (phone me downloaded)
#    2. GitHub username
#    3. GitHub token  ->  github.com/settings/tokens
#                         "Generate new token (classic)" -> repo TICK -> Generate
# ============================================================================

import os, sys, glob, json, shutil, zipfile, subprocess, traceback


def main():
    print("=" * 52)
    print("  AJAY AI ASSISTANT — DEPLOY")
    print("=" * 52)

    # ---------------------------------------------------------------- 1. ZIP
    zips = sorted(glob.glob('/content/*.zip'), key=os.path.getmtime, reverse=True)

    if zips:
        zip_path = zips[0]
        print(f"\n[1/5] ZIP pehle se hai: {os.path.basename(zip_path)}")
    else:
        print("\n[1/5] ZIP upload karo — 'Choose Files' dabao")
        try:
            from google.colab import files
            up = files.upload()
        except Exception as e:
            print(f"      ERROR: upload nahi hua ({e})")
            print("      FIX  : Runtime -> Restart runtime, phir dobara chalao")
            return

        picked = [n for n in up if n.lower().endswith('.zip')]
        if not picked:
            print(f"      ERROR: .zip nahi mili. Aapne chuna: {list(up) or 'kuch nahi'}")
            print("      FIX  : sirf ajay-ai-assistant.zip select karo")
            return
        zip_path = '/content/' + picked[0]

    size_kb = os.path.getsize(zip_path) // 1024
    print(f"      OK — {size_kb} KB")
    if size_kb < 100:
        print("      WARNING: file chhoti hai, download adhoora ho sakta hai")

    # ------------------------------------------------------------ 2. EXTRACT
    print("\n[2/5] Extract kar raha hoon...")
    shutil.rmtree('/content/work', ignore_errors=True)
    os.makedirs('/content/work', exist_ok=True)
    try:
        with zipfile.ZipFile(zip_path) as z:
            z.extractall('/content/work')
    except zipfile.BadZipFile:
        print("      ERROR: ZIP kharab hai (download adhoora tha)")
        print("      FIX  : dobara download karo, /content se purani zip delete karo")
        return

    project = None
    for root, dirs, files_ in os.walk('/content/work'):
        if 'backend' in dirs and 'README.md' in files_:
            if os.path.isfile(os.path.join(root, 'backend', 'requirements.txt')):
                project = root
                break

    if not project:
        print("      ERROR: project folder nahi mila")
        print("      ZIP ke andar ye tha:")
        for p in sorted(os.listdir('/content/work'))[:8]:
            print("        -", p)
        return

    n_files = sum(len(f) for _, _, f in os.walk(project))
    has_yaml = os.path.isfile(os.path.join(project, 'render.yaml'))
    print(f"      OK — {n_files} files")
    print(f"      render.yaml: {'mil gaya' if has_yaml else 'NAHI MILA (galat zip?)'}")
    if not has_yaml:
        return

    # -------------------------------------------------------------- 3. INPUT
    print("\n[3/5] GitHub details")
    print("      (token paste karne ke liye box pe DER TAK dabao -> Paste)")
    print("      (token type karte waqt kuch DIKHEGA NAHI — ye normal hai)\n")

    from getpass import getpass
    try:
        user = input("      GitHub username : ").strip().strip('\'"')
        repo = input("      Repo naam [Enter = ajay-ai-assistant] : ").strip()
        repo = (repo or 'ajay-ai-assistant').strip('\'"')
        token = getpass("      Token (dikhega nahi) : ").strip().strip('\'"')
    except EOFError:
        print("\n      ERROR: input nahi mila (cell ruk gaya tha)")
        print("      FIX  : cell dobara chalao aur teeno cheezein bharo")
        return
    except KeyboardInterrupt:
        print("\n      Aapne rok diya. Dobara chalao.")
        return

    if not user:
        print("\n      ERROR: username khaali hai -> dobara chalao")
        return
    if not token:
        print("\n      ERROR: token khaali hai — paste hua nahi tha")
        print("      FIX  : box pe der tak dabao -> Paste -> Enter")
        return
    if len(token) < 20:
        print(f"\n      ERROR: token bahut chhota hai ({len(token)} chars)")
        print("      FIX  : poora token copy karo (~40 chars, ghp_ se shuru)")
        return

    print(f"\n      user={user}  repo={repo}  token={token[:7]}...({len(token)})")

    # -------------------------------------------------------- 4. TOKEN CHECK
    print("\n[4/5] Token check...")
    try:
        import requests
    except ImportError:
        subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', 'requests'])
        import requests

    H = {'Authorization': f'token {token}',
         'Accept': 'application/vnd.github+json'}
    try:
        r = requests.get('https://api.github.com/user', headers=H, timeout=30)
    except Exception as e:
        print(f"      ERROR: internet issue ({e})")
        return

    if r.status_code == 401:
        print("      ERROR: token galat hai (401 Bad credentials)")
        print("      FIX  : naya token banao ->  github.com/settings/tokens")
        print("             'Generate new token (classic)', repo TICK karo")
        return
    if r.status_code != 200:
        print(f"      ERROR: GitHub {r.status_code} — {r.text[:150]}")
        return

    login = r.json()['login']
    scopes = r.headers.get('x-oauth-scopes', '')
    print(f"      OK — login: {login}")
    print(f"      permissions: {scopes or '(khaali)'}")

    if token.startswith('ghp_') and 'repo' not in scopes:
        print("\n      ERROR: token me 'repo' permission NAHI hai")
        print("      FIX  : naya token banao aur 'repo' checkbox TICK karo")
        print("             github.com/settings/tokens")
        return

    if login.lower() != user.lower():
        print(f"      NOTE: token {login} ka hai — wahi use kar raha hoon")
        user = login

    # -------------------------------------------------------------- 5. PUSH
    print("\n[5/5] GitHub pe bhej raha hoon...")

    cr = requests.post('https://api.github.com/user/repos', headers=H,
                       json={'name': repo, 'private': False,
                             'description': 'Ajay AI Assistant'}, timeout=30)
    if cr.status_code == 201:
        print(f"      repo bana: {repo}")
    elif cr.status_code == 422:
        print(f"      repo pehle se hai: {repo}")
    else:
        print(f"      repo API: {cr.status_code} (aage badh raha hoon)")

    def sh(cmd):
        p = subprocess.run(cmd, shell=True, cwd=project,
                           capture_output=True, text=True)
        return p.returncode, (p.stdout + p.stderr).replace(token, '***').strip()

    url = f'https://{token}@github.com/{user}/{repo}.git'
    plan = [
        ('git init -q', True),
        ('git config user.email colab@example.com', True),
        ('git config user.name Colab', True),
        ('git add -A', False),
        ('git commit -q -m "Ajay AI Assistant"', True),
        ('git branch -M main', False),
        ('git remote remove origin', True),
        (f'git remote add origin {url}', False),
        ('git push -u origin main --force', False),
    ]

    for cmd, soft in plan:
        rc, out = sh(cmd)
        if rc != 0 and not soft:
            label = cmd.split()[1]
            print(f"\n      ERROR: '{label}' fail hua")
            low = out.lower()
            if 'authentication failed' in low or '403' in low:
                print("      WAJAH: token me 'repo' permission nahi")
                print("      FIX  : naya token, repo TICK karo")
            elif 'not found' in low or '404' in low:
                print(f"      WAJAH: {user}/{repo} nahi mila")
                print("      FIX  : username spelling check karo")
            elif 'nothing to commit' in low:
                print("      WAJAH: files nahi mili")
            else:
                for line in out.splitlines()[-5:]:
                    print("       ", line)
            return

    print("\n" + "=" * 52)
    print("  HO GAYA! Code GitHub pe pahunch gaya")
    print("=" * 52)
    print(f"\n  https://github.com/{user}/{repo}\n")
    print("  AB YE KARO:")
    print("   1. render.com kholo")
    print("   2. 'Get Started' -> GitHub se sign in")
    print("   3. Authorize Render")
    print("   4. New +  ->  Blueprint")
    print(f"   5. repo '{repo}' chuno  ->  Connect")
    print("   6. Apply dabao")
    print("   7. 3-5 min ruko -> URL milega -> phone me kholo\n")


# Kabhi bhi raw traceback nahi dikhega — hamesha samajh aane wala message.
try:
    main()
except Exception:
    print("\n" + "=" * 52)
    print("  UNEXPECTED ERROR — ye poora text mujhe bhejo")
    print("=" * 52)
    traceback.print_exc()
    print("=" * 52)
