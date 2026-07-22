# 影片上傳與更換指南

## 影片格式

上傳前建議先轉成：

- MP4
- H.264 影像編碼
- 16:9 畫面比例
- 1280×720 或 1920×1080
- 檔案名稱只能是 `node-1.mp4`、`node-2.mp4`、`node-3.mp4`
- 使用 GitHub 網頁上傳時，每支影片需小於 25 MiB

影片支援聲音。因 iPad Safari 的自動播放限制，每次 Web App 開啟或重新載入後，工作人員必須先在畫面上點一次「開啟聲音並開始體驗」。按鈕消失後，同一個頁面收到的 ESP32 訊號都會自動全螢幕、有聲播放。請在 iPad 封入牆面或開啟「引導使用模式」前完成這一步。

## 用 GitHub 網頁更換影片

1. 開啟 <https://github.com/Axoled-Student/Baechhhh/tree/main/assets/videos>。
2. 按右上角 **Add file** → **Upload files**。
3. 將新影片改成正確檔名後拖進去：
   - 第一支：`node-1.mp4`
   - 第二支：`node-2.mp4`
   - 第三支：`node-3.mp4`
4. 在頁面下方按 **Commit changes**。
5. 等待約一分鐘讓 GitHub Pages 發布。
6. 固定 iPad 每五分鐘會檢查影片是否更新；不需要觸控重新整理。

## 將任意影片轉成 10 秒 Demo

電腦已安裝 FFmpeg，可以在 PowerShell 執行：

```powershell
ffmpeg -i "原始影片.mp4" -t 10 -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2" -c:v libx264 -crf 23 -preset medium -c:a aac -b:a 128k -movflags +faststart "node-1.mp4"
```

要更換第二或第三支，只需把輸出檔名改成 `node-2.mp4` 或 `node-3.mp4`。

## 修改網站文字

- 貴賓畫面文字與結構：`index.html`
- 顏色、尺寸、全螢幕外觀：`styles.css`
- 節點與影片對應、播放結束行為：`app.js`
- ESP32 測試控制頁：`test.html`、`test.js`、`test.css`

修改完成後 commit 到 `main` 分支，GitHub Pages 會自動重新發布。

## iPad 真正全螢幕安裝

Safari 網頁本身無法在沒有觸控的情況下關閉網址列。封入牆面前需設定一次：

1. 用 Safari 開啟 <https://axoled-student.github.io/Baechhhh/>。
2. 按 **分享** → **加入主畫面**。
3. 開啟 **作為 Web App 打開**。
4. 按 **加入**。
5. 回到主畫面，從新建立的圖示開啟展示網站。

之後 ESP32 觸發影片時，影片會自動覆蓋整個 Web App 畫面；10 秒 Demo 播放完畢後，畫面會提示貴賓拿起板塊。
