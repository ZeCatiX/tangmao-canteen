import subprocess, sys, json
r = subprocess.run([sys.executable, 'get_feature_importance.py'], capture_output=True, text=True, timeout=120)
data = json.loads(r.stdout)
with open('feature_importance.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False)
print('OK:', len(data.get('importance', [])), 'features')