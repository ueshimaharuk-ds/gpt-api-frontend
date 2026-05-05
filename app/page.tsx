// startVoice関数内のfetch部分のみ抜粋
const startVoice = async () => {
  try {
    setStatus("connecting...");
    addLog("🔑 Azureセッション取得リクエスト送信中...");

    // 自前バックエンドのURL
    const tokenRes = await fetch(
      "https://gpt-api-backend-eneaaeh0h0cxgxf6.japanwest-01.azurewebsites.net/realtime/session",
      { method: "POST" }
    );

    const tokenData = await tokenRes.json();
    
    // エラーハンドリング追加
    if (!tokenData.client_secret || !tokenData.client_secret.value) {
      console.error("Invalid token data:", tokenData);
      throw new Error("エフェメラルキーの取得に失敗しました。バックエンドのログを確認してください。");
    }

    const EPHEMERAL_KEY = tokenData.client_secret.value;
    addLog("✅ エフェメラルキー取得成功");

    // --- WebRTCの設定 (既存コードと同じ) ---
    const pc = new RTCPeerConnection();
    // ...中略...

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // AzureのWebRTCエンドポイントURL (sessions ではなく realtime)
    const AZURE_REALTIME_URL = `https://gpt-api-realtime.openai.azure.com/openai/deployments/gpt-realtime-1.5/realtime?api-version=2024-10-01-preview`;

    const response = await fetch(AZURE_REALTIME_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${EPHEMERAL_KEY}`, // 取得したキーを使用
        "Content-Type": "application/sdp",
      },
      body: offer.sdp,
    });

    const answerSDP = await response.text();
    await pc.setRemoteDescription({ type: "answer", sdp: answerSDP });

    setStatus("connected");
    addLog("🎤 接続完了。お話しください。");
  } catch (err) {
    addLog(`❌ エラー: ${err.message}`);
    setStatus("error");
  }
};