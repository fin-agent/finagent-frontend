import { AccessToken, AgentDispatchClient, RoomServiceClient } from 'livekit-server-sdk';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const livekitUrl = process.env.LIVEKIT_URL;

    if (!apiKey || !apiSecret || !livekitUrl) {
      return NextResponse.json(
        { error: 'LiveKit credentials not configured' },
        { status: 500 }
      );
    }

    // Generate a unique room name for this session
    const roomName = `finagent-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Generate a unique participant identity
    const participantIdentity = `user-${Date.now()}`;
    const participantName = 'Trader';

    // Create the room first
    const roomService = new RoomServiceClient(livekitUrl, apiKey, apiSecret);
    await roomService.createRoom({ name: roomName, emptyTimeout: 60 });

    // Dispatch the finagent explicitly by name (prevents duplicate agents)
    const agentDispatch = new AgentDispatchClient(livekitUrl, apiKey, apiSecret);
    await agentDispatch.createDispatch(roomName, 'finagent');

    // Create access token with permissions
    const at = new AccessToken(apiKey, apiSecret, {
      identity: participantIdentity,
      name: participantName,
      ttl: '15m', // Token expires in 15 minutes
    });

    // Grant permissions to join the room and publish audio
    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();

    return NextResponse.json({
      serverUrl: livekitUrl,
      roomName,
      participantToken: token,
      participantName,
    });
  } catch (error) {
    console.error('Error generating LiveKit token:', error);
    return NextResponse.json(
      { error: 'Failed to generate connection details' },
      { status: 500 }
    );
  }
}
