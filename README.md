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

網站第一次在 iPad Safari 開啟時，會把三支影片存進裝置快取。上方顯示「三支影片已快取」後，即使網路短暫不穩，影片仍可由本機播放。更換 GitHub 上的 MP4 後，請在每台 iPad 點一下快取狀態按鈕，讓它重新下載最新版影片。

## 放置感應板塊

程式不是依板塊在感應區的左、中、右位置判斷，而是依 GPIO 34 的 ADC 值辨識板塊。一次只放一塊已配對的板塊，平放並確認接點完全貼合，保持約 0.3 秒直到對應影片播放。若 ADC 落在三個有效範圍以外，網站會回到等待畫面。

## 即時連線說明

GitHub Pages 只負責公開靜態網站；ESP32 與網頁之間使用 HiveMQ 公開測試 MQTT broker。這適合目前 Demo，不提供私密性或服務保證。正式展出時建議改成有帳號密碼的專用 MQTT broker，並同步更換 `Baechhhh.ino` 和 `app.js` 裡的 broker/topic。
