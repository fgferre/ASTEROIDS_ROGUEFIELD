# How to Send Performance Data to Claude

The game now automatically logs performance data. Just download the file and I'll read it!

## Steps:

1. **Play the game** for 2-3 minutes (get to wave 3-5)

2. **Open browser console** (press F12)

3. **Type this command**:
   ```javascript
   window.performanceMonitor.downloadLogs()
   ```

4. **Press Enter**

5. A file called `performance-log.json` will download to your Downloads folder

6. **Move the file to the project folder** (same folder as this README)

That's it! The game logs performance data every 10 seconds automatically, and I can read the JSON file directly.

---

## What I'll Learn:

- How many enemies/bullets/particles are on screen
- If FPS drops during intense moments
- If memory usage is stable
- What wave you reached
- If there are any performance bottlenecks

This helps me tune the game balance properly!

---

## Optional: Custom Filename

Download with a specific name (useful for multiple tests):

```javascript
window.performanceMonitor.downloadLogs('test-wave-10.json')
```
