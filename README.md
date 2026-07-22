# Baechhhh ESP32 影片節點

ESP32 讀取 GPIO 34 的 ADC 值，透過 Wi-Fi/MQTT 將節點狀態即時送到 GitHub Pages。平板只要保持網頁開啟，就會依照 `ON|1`、`ON|2`、`ON|3` 自動切換影片；回到無節點狀態時顯示等待畫面。

## 第一次連 Wi-Fi

1. 將 `Baechhhh.ino` 上傳至 ESP32。
2. ESP32 第一次開機會建立名為 `ESP32-Video-Setup` 的 Wi-Fi。
3. 用手機或平板連上這個 Wi-Fi，設定頁會自動出現；若沒有，開啟 `http://192.168.4.1`。
4. 選擇現場 Wi-Fi 並輸入密碼。密碼只儲存在 ESP32，不會進入 GitHub。

若要更換 Wi-Fi，可清除 ESP32 的 Wi-Fi/NVS 設定後重新啟動，再進行一次上述流程。

## Arduino 需要的程式庫

- ESP32 Arduino core 3.3.10
- WiFiManager 2.0.17
- PubSubClient 2.8.0

Arduino CLI 編譯範例：

```powershell
arduino-cli compile --fqbn esp32:esp32:esp32 .
```

## 節點 ADC 範圍

| 節點 | GPIO 34 ADC |
| --- | --- |
| 無 | 其他範圍 |
| 1 | 200–999 |
| 2 | 1200–2199 |
| 3 | 2400–3399 |

## 更換影片

以新 MP4 覆蓋下列檔案即可，不必改程式：

- `assets/videos/node-1.mp4`
- `assets/videos/node-2.mp4`
- `assets/videos/node-3.mp4`

建議使用 H.264 MP4、相同畫面比例，並控制檔案大小，平板切換會比較快。

完整的 GitHub 上傳、FFmpeg 轉檔、網站文字修改與 iPad 全螢幕設定，請見 [`VIDEO_GUIDE.md`](VIDEO_GUIDE.md)。

每次 iPad Web App 開啟或重新載入後，工作人員需先點一次「開啟聲音並開始體驗」。這個使用者手勢會解鎖瀏覽器的有聲播放權限；之後 ESP32 觸發不需再碰螢幕。

網站第一次在 iPad Safari 開啟時，會在背景把三支影片存進裝置快取。固定展示期間不需要觸控操作；網頁每五分鐘檢查網站與影片是否更新。

## 放置感應板塊

展示畫面使用大人與小孩都能理解的三個圖像步驟：選一塊、放上去、看故事。技術上，程式是依 GPIO 34 的 ADC 值辨識板塊；若數值落在三個有效範圍以外，網站會回到等待畫面。

## 即時連線說明

GitHub Pages 只負責公開靜態網站；ESP32 與網頁之間使用 HiveMQ 公開測試 MQTT broker。這適合目前 Demo，不提供私密性或服務保證。正式展出時建議改成有帳號密碼的專用 MQTT broker，並同步更換 `Baechhhh.ino` 和 `app.js` 裡的 broker/topic。

## ESP32 訊號模擬器

開啟 `test.html` 可從手機或電腦模擬 ESP32 的 `ON|1`、`ON|2`、`ON|3`、`OFF|0` 訊號，也能自動輪流測試三個節點。測試頁與牆內 iPad 使用同一個 MQTT topic，因此按下後展示畫面會即時切換。

模擬器使用非保留 MQTT 訊號；重新整理展示頁時不會重播最後一次測試節點。展示頁也會忽略 broker 在訂閱瞬間送來的 retained 舊狀態，只處理頁面已連線後收到的新事件。
