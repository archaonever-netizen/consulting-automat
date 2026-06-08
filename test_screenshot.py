import subprocess
import time

# Give Flask time to hot-reload if needed
time.sleep(1)

# Use chromium-cli to take screenshot
try:
    result = subprocess.run([
        'chromium-cli',
        '--headless',
        '--disable-gpu',
        '--screenshot=screenshot.png',
        'http://localhost:5000/client/2'
    ], capture_output=True, text=True, timeout=10)
    print("Screenshot taken:", result.returncode)
    if result.stderr:
        print("Stderr:", result.stderr[:200])
except Exception as e:
    print(f"Screenshot failed: {e}")
    # Try with curl to at least get the HTML
    import requests
    try:
        r = requests.get('http://localhost:5000/client/2', timeout=5)
        print(f"Page loaded: {r.status_code}")
        # Find brief cards in the HTML
        if 'brief-card' in r.text:
            print("✓ Brief cards found in HTML")
            # Check for new structure
            if 'bf-status' in r.text and 'bf-actions' in r.text:
                print("✓ Updated HTML structure found (bf-status and bf-actions)")
            else:
                print("✗ New HTML structure not found")
    except Exception as e2:
        print(f"Request failed: {e2}")
