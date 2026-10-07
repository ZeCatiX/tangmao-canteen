import subprocess, sys, json, os
_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
r = subprocess.run([sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'get_feature_importance.py')], capture_output=True, text=True, timeout=120)
data = json.loads(r.stdout)
with open(os.path.join(_ROOT, 'feature_importance.json'), 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False)
print('OK:', len(data.get('importance', [])), 'features')