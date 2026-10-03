-- ═══════════════════════════════════════════════════════════════
--  Universal Hub v3.5.4  (Games, Fly, ESP, Fast Walk, High Jump, Anti-AFK, Exec Counter)
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
local RunService  = game:GetService("RunService")
local LP = Players.LocalPlayer

local RELAY_WS   = "wss://serverssszz.onrender.com"
local RELAY_HTTP = "https://serverssszz.onrender.com"
local WebSocket  = WebSocket or (syn and syn.websocket) or nil
local loadstring = loadstring or nil
local request    = request or (syn and syn.request) or http_request
local gethui     = gethui or (syn and syn.protect_gui and function() end) or nil

local function fetchUrl(url)
    local ok, body = pcall(function() return game:HttpGet(url) end)
    if ok and type(body) == "string" and body ~= "" then return body end
    if request then
        local ok2, resp = pcall(function()
            return request({Url = url, Method = "GET"})
        end)
        if ok2 and resp and type(resp.Body) == "string" and resp.Body ~= "" then
            return resp.Body
        end
    end
    return nil
end

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

local spawnTask = (task and task.spawn) or (coroutine and function(fn, ...) coroutine.wrap(fn)(...) end) or function(fn, ...) fn(...) end
local waitTask  = (task and task.wait) or wait

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
local titleLbl = C("TextLabel",{BackgroundTransparency=1,Position=UDim2.new(0,14,0,0),Size=UDim2.new(1,-70,1,0),Font=Enum.Font.GothamBold,Text="Universal Hub — v3.5.4",TextColor3=T.Text,TextTransparency=1,TextSize=12,TextXAlignment=Enum.TextXAlignment.Left,ZIndex=3,Parent=titleBar})

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
    local lastTabFire = 0
    local function trySelect()
        local now = tick()
        if now - lastTabFire < 0.3 then return end
        lastTabFire = now
        pcall(select)
    end
    btn.Activated:Connect(trySelect)
    btn.MouseButton1Click:Connect(trySelect)
    btn.MouseEnter:Connect(function() if page.Visible then return end; tw(btn, QI, {BackgroundTransparency=0.1}) end)
    btn.MouseLeave:Connect(function() if page.Visible then return end; tw(btn, QI, {BackgroundTransparency=0.3}) end)
    if #pages == 1 then pcall(select) end
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
    local lastFire = 0
    local function tryFire()
        local now = tick()
        if now - lastFire < 0.3 then return end
        lastFire = now
        state = not state; render()
        if cb then
            local ok, err = pcall(cb, state)
            if not ok then warn("[Toggle] '"..name.."' callback error:", err) end
        end
    end
    b.Activated:Connect(tryFire)
    b.MouseButton1Click:Connect(tryFire)
end
local function Button(parent, name, cb)
    local f = C("Frame",{BackgroundColor3=T.Panel,BackgroundTransparency=0.25,Size=UDim2.new(1,0,0,28),Active=true,Parent=parent})
    corner(f,6); stroke(f, T.Stroke, 1, 0.5)
    C("TextLabel",{BackgroundTransparency=1,Position=UDim2.new(0,10,0,0),Size=UDim2.new(1,-20,1,0),Font=Enum.Font.Gotham,Text=name,TextColor3=T.Text,TextSize=11,TextXAlignment=Enum.TextXAlignment.Left,Parent=f})
    local b = C("TextButton",{BackgroundTransparency=1,Size=UDim2.new(1,0,1,0),Text="",Active=true,AutoButtonColor=false,Parent=f})
    b.MouseEnter:Connect(function() tw(f, QI, {BackgroundTransparency=0.05,BackgroundColor3=T.Hover}) end)
    b.MouseLeave:Connect(function() tw(f, QI, {BackgroundTransparency=0.25,BackgroundColor3=T.Panel}) end)
    b.MouseButton1Down:Connect(function() tw(f, QI, {BackgroundTransparency=0,BackgroundColor3=T.Accent}) end)
    b.MouseButton1Up:Connect(function() tw(f, QI, {BackgroundTransparency=0.05,BackgroundColor3=T.Hover}) end)
    local lastFire = 0
    local function tryFire()
        local now = tick()
        if now - lastFire < 0.3 then return end
        lastFire = now
        if cb then
            local ok, err = pcall(cb)
            if not ok then warn("[Button] '"..name.."' callback error:", tostring(err)) end
        end
    end
    b.Activated:Connect(tryFire)
    b.MouseButton1Click:Connect(tryFire)
end

-- ═══════════════════════════════════════════════════════════════
--  CHARACTER TRAIT STATE
-- ═══════════════════════════════════════════════════════════════
local TRAITS = {
    walkOn = false,
    walkSpeed = 100,
    jumpOn = false,
    jumpPower = 150,
    flyOn = false,
}

local function applyTraits(char)
    local hum = char and char:FindFirstChildOfClass("Humanoid")
    if not hum then return end
    if TRAITS.walkOn then hum.WalkSpeed = TRAITS.walkSpeed end
    if TRAITS.jumpOn then
        hum.UseJumpPower = true
        hum.JumpPower = TRAITS.jumpPower
    end
end

LP.CharacterAdded:Connect(function(char)
    waitTask(0.4)
    applyTraits(char)
end)

-- ═══════════════════════════════════════════════════════════════
--  FLY
-- ═══════════════════════════════════════════════════════════════
local flyRefs = { bv=nil, bg=nil, conn=nil, charConn=nil, controlModule=nil }

local function stopFly()
    TRAITS.flyOn = false
    if flyRefs.conn then flyRefs.conn:Disconnect(); flyRefs.conn = nil end
    if flyRefs.charConn then flyRefs.charConn:Disconnect(); flyRefs.charConn = nil end
    if flyRefs.bv then pcall(function() flyRefs.bv:Destroy() end); flyRefs.bv = nil end
    if flyRefs.bg then pcall(function() flyRefs.bg:Destroy() end); flyRefs.bg = nil end
    local char = LP.Character
    if char then
        local hum = char:FindFirstChildOfClass("Humanoid")
        if hum then hum.PlatformStand = false end
        local root = char:FindFirstChild("HumanoidRootPart")
        if root then
            for _, n in ipairs(root:GetChildren()) do
                if n.Name == "_UHFlyBV" or n.Name == "_UHFlyBG" then n:Destroy() end
            end
        end
    end
end

local function startFly()
    stopFly()
    local char = LP.Character
    if not char then return end
    local hum = char:FindFirstChildOfClass("Humanoid")
    local root = char:FindFirstChild("HumanoidRootPart")
    if not hum or not root then return end

    pcall(function()
        flyRefs.controlModule = require(LP.PlayerScripts:WaitForChild("PlayerModule"):WaitForChild("ControlModule"))
    end)

    local bv = Instance.new("BodyVelocity")
    bv.Name = "_UHFlyBV"
    bv.MaxForce = Vector3.new(9e9, 9e9, 9e9)
    bv.Velocity = Vector3.new(0, 0, 0)
    bv.Parent = root

    local bg = Instance.new("BodyGyro")
    bg.Name = "_UHFlyBG"
    bg.MaxTorque = Vector3.new(9e9, 9e9, 9e9)
    bg.P = 9e4
    bg.D = 50
    bg.CFrame = workspace.CurrentCamera.CFrame
    bg.Parent = root

    flyRefs.bv = bv
    flyRefs.bg = bg
    TRAITS.flyOn = true

    local FLY_SPEED = 60

    flyRefs.conn = RunService.RenderStepped:Connect(function()
        if not TRAITS.flyOn then return end
        local c = LP.Character
        if not c then return end
        local r = c:FindFirstChild("HumanoidRootPart")
        local h = c:FindFirstChildOfClass("Humanoid")
        if not r or not h then return end

        local bvv = r:FindFirstChild("_UHFlyBV")
        local bgg = r:FindFirstChild("_UHFlyBG")
        if not bvv or not bgg then return end

        h.PlatformStand = true
        local cam = workspace.CurrentCamera
        bgg.CFrame = cam.CFrame

        local dir = Vector3.new(0, 0, 0)
        if flyRefs.controlModule then
            local ok, v = pcall(function() return flyRefs.controlModule:GetMoveVector() end)
            if ok and v then dir = v end
        end

        local camCF = cam.CFrame
        bvv.Velocity = (camCF.LookVector * (-dir.Z * FLY_SPEED))
                     + (camCF.RightVector * (dir.X * FLY_SPEED))
    end)

    flyRefs.charConn = LP.CharacterAdded:Connect(function()
        waitTask(1)
        if TRAITS.flyOn then startFly() end
    end)
end

-- ═══════════════════════════════════════════════════════════════
--  ANTI-AFK
-- ═══════════════════════════════════════════════════════════════
local antiAfkConn = nil
local antiAfkDisabledHandlers = {}

local function startAntiAfk()
    if getconnections then
        local ok, conns = pcall(getconnections, LP.Idled)
        if ok and conns then
            for _, c in ipairs(conns) do
                pcall(function() c:Disable() end)
                pcall(function() c:Disconnect() end)
                table.insert(antiAfkDisabledHandlers, c)
            end
        end
    end

    if antiAfkConn then antiAfkConn:Disconnect() end
    antiAfkConn = LP.Idled:Connect(function()
        local VIM = game:GetService("VirtualInputManager")
        if VIM then
            pcall(function()
                VIM:SendMouseButtonEvent(0, 0, 0, true, game, 0)
                VIM:SendMouseButtonEvent(0, 0, 0, false, game, 0)
            end)
        end
    end)
end

local function stopAntiAfk()
    if antiAfkConn then antiAfkConn:Disconnect(); antiAfkConn = nil end
    antiAfkDisabledHandlers = {}
end

-- ═══════════════════════════════════════════════════════════════
--  ESP
-- ═══════════════════════════════════════════════════════════════
local ESP = { on=false, teamCheck=true, container=nil, entries={} }
local COLOR_TEAM    = Color3.fromRGB(50, 120, 255)
local COLOR_ENEMY   = Color3.fromRGB(255, 50, 50)
local COLOR_NEUTRAL = Color3.fromRGB(220, 220, 220)

local function isTeammate(player)
    local myTeam = LP.Team
    local theirTeam = player.Team
    if not myTeam or not theirTeam then return nil end
    return myTeam == theirTeam
end

local function espColorFor(player)
    if not ESP.teamCheck then return COLOR_NEUTRAL end
    local same = isTeammate(player)
    if same == nil then return COLOR_NEUTRAL end
    return same and COLOR_TEAM or COLOR_ENEMY
end

local function ensureContainer()
    if ESP.container and ESP.container.Parent then return ESP.container end
    local parent
    if gethui then pcall(function() parent = gethui() end) end
    if not parent then parent = game:GetService("CoreGui") end
    local folder = Instance.new("Folder")
    folder.Name = "_UniversalHubESP"
    folder.Parent = parent
    ESP.container = folder
    return folder
end

local function destroyESP()
    for _, entry in pairs(ESP.entries) do
        if entry.box then pcall(function() entry.box:Destroy() end) end
    end
    ESP.entries = {}
    if ESP.container then pcall(function() ESP.container:ClearAllChildren() end) end
end

local function refreshESP()
    if not ESP.on then return end
    local container = ensureContainer()

    for plr, entry in pairs(ESP.entries) do
        if not plr.Parent then
            if entry.box then pcall(function() entry.box:Destroy() end) end
            ESP.entries[plr] = nil
        end
    end

    for _, plr in ipairs(Players:GetPlayers()) do
        if plr ~= LP then
            local char = plr.Character
            local hrp = char and char:FindFirstChild("HumanoidRootPart")
            local entry = ESP.entries[plr]

            if not hrp then
                if entry and entry.box then
                    pcall(function() entry.box:Destroy() end)
                    ESP.entries[plr] = nil
                end
            else
                if not entry or entry.char ~= char or not entry.box.Parent then
                    if entry and entry.box then pcall(function() entry.box:Destroy() end) end
                    local box = Instance.new("BoxHandleAdornment")
                    box.Name = "ESPB_" .. plr.UserId
                    box.Adornee = hrp
                    box.AlwaysOnTop = true
                    box.ZIndex = 10
                    box.Size = Vector3.new(4, 6, 4)
                    box.Transparency = 0.5
                    box.Color3 = espColorFor(plr)
                    box.Parent = container
                    ESP.entries[plr] = { box = box, char = char }
                else
                    local newColor = espColorFor(plr)
                    if entry.box.Color3 ~= newColor then entry.box.Color3 = newColor end
                end
            end
        end
    end
end

spawnTask(function()
    while true do
        waitTask(1)
        if ESP.on then pcall(refreshESP) end
    end
end)

Players.PlayerRemoving:Connect(function(plr)
    local entry = ESP.entries[plr]
    if entry and entry.box then pcall(function() entry.box:Destroy() end) end
    ESP.entries[plr] = nil
end)

-- ═══════════════════════════════════════════════════════════════
--  TABS
-- ═══════════════════════════════════════════════════════════════
local gamesTab = makeTab("Games")
local mainTab = makeTab("Main")
local moveTab = makeTab("Movement")
local espTab  = makeTab("ESP")
local aboutTab= makeTab("About")

-- ── Games ──
Section(gamesTab, "Game Scripts")

local ddgLoading = false
Button(gamesTab, "Duck Duck (TAG) Script", function()
    warn("[Games] 1. DDG button clicked")

    if ddgLoading then
        warn("[Games] DDG already loading — ignoring")
        return
    end
    ddgLoading = true

    spawnTask(function()
        local ok, err = pcall(function()
            local url = RELAY_HTTP .. "/ddg.lua"
            warn("[Games] 2. Fetching DDG: " .. url)

            local src = fetchUrl(url)
            if not src or src == "" then
                error("Empty response from " .. url)
            end
            warn("[Games] 3. Got " .. tostring(#src) .. " bytes")

            local compiler = loadstring or load
            if not compiler then
                error("No loadstring/load available in this executor")
            end

            local fn = compiler(src)
            if not fn then
                error("Compilation failed — loadstring returned nil")
            end

            warn("[Games] 4. Executing DDG...")
            fn()
            warn("[Games] 5. DDG finished")
        end)

        ddgLoading = false

        if ok then
            warn("[Games] DDG loaded successfully")
            pcall(function() notify("Games", "Duck Duck Goose loaded!", T.Good) end)
        else
            warn("[Games] DDG failed: " .. tostring(err))
            pcall(function() notify("Games", "Failed: " .. tostring(err), T.Bad) end)
        end
    end)

    pcall(function() notify("Games", "Loading Duck Duck Goose script...", T.Accent) end)
end)

local mm2Loading = false
Button(gamesTab, "MM2 Script", function()
    warn("[Games] 1. MM2 button clicked")

    if mm2Loading then
        warn("[Games] MM2 already loading — ignoring")
        return
    end
    mm2Loading = true

    spawnTask(function()
        local ok, err = pcall(function()
            local url = RELAY_HTTP .. "/mm2.lua"
            warn("[Games] 2. Fetching MM2: " .. url)

            local src = fetchUrl(url)
            if not src or src == "" then
                error("Empty response from " .. url)
            end
            warn("[Games] 3. Got " .. tostring(#src) .. " bytes")

            local compiler = loadstring or load
            if not compiler then
                error("No loadstring/load available in this executor")
            end

            local fn = compiler(src)
            if not fn then
                error("Compilation failed — loadstring returned nil")
            end

            warn("[Games] 4. Executing MM2...")
            fn()
            warn("[Games] 5. MM2 finished")
        end)

        mm2Loading = false

        if ok then
            warn("[Games] MM2 loaded successfully")
            pcall(function() notify("Games", "MM2 script loaded!", T.Good) end)
        else
            warn("[Games] MM2 failed: " .. tostring(err))
            pcall(function() notify("Games", "Failed: " .. tostring(err), T.Bad) end)
        end
    end)

    pcall(function() notify("Games", "Loading MM2 script...", T.Accent) end)
end)

Section(gamesTab, "Info")
C("TextLabel",{
    BackgroundTransparency=1, Size=UDim2.new(1,0,0,110),
    Font=Enum.Font.Gotham,
    Text="Loads standalone game-specific hubs.\n\n• Duck Duck Goose Hub v4.3\n• MM2 Hub (Mm2 Hub) — Murder Mystery 2 script\n\nEach opens its own separate window once loaded.",
    TextColor3=T.Dim, TextSize=11, TextWrapped=true,
    TextXAlignment=Enum.TextXAlignment.Left,
    TextYAlignment=Enum.TextYAlignment.Top, Parent=gamesTab,
})

-- ── Main ──
Section(mainTab, "Global Stats")
local execValueLbl
do
    local f = C("Frame",{BackgroundColor3=T.Panel,BackgroundTransparency=0.25,Size=UDim2.new(1,0,0,44),Parent=mainTab})
    corner(f,6); stroke(f, T.Stroke, 1, 0.5)
    C("TextLabel",{BackgroundTransparency=1,Position=UDim2.new(0,12,0,6),Size=UDim2.new(1,-24,0,12),Font=Enum.Font.GothamBold,Text="TOTAL HUB EXECUTIONS",TextColor3=T.Dim,TextSize=9,TextXAlignment=Enum.TextXAlignment.Left,Parent=f})
    execValueLbl = C("TextLabel",{BackgroundTransparency=1,Position=UDim2.new(0,12,0,18),Size=UDim2.new(1,-24,0,22),Font=Enum.Font.GothamBold,Text="loading...",TextColor3=T.Accent,TextSize=18,TextXAlignment=Enum.TextXAlignment.Left,Parent=f})
end

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
        if _G._infJump then _G._infJump:Disconnect(); _G._infJump = nil end
    end
end)
Toggle(mainTab, "Anti AFK", false, function(on)
    if on then startAntiAfk() else stopAntiAfk() end
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

-- ── Movement ──
Section(moveTab, "Speed")
Toggle(moveTab, "Fast Walk (100)", false, function(on)
    TRAITS.walkOn = on
    local char = LP.Character
    local hum = char and char:FindFirstChildOfClass("Humanoid")
    if hum then hum.WalkSpeed = on and TRAITS.walkSpeed or 16 end
end)
Toggle(moveTab, "High Jump (150)", false, function(on)
    TRAITS.jumpOn = on
    local char = LP.Character
    local hum = char and char:FindFirstChildOfClass("Humanoid")
    if hum then
        if on then
            hum.UseJumpPower = true
            hum.JumpPower = TRAITS.jumpPower
        else
            hum.UseJumpPower = true
            hum.JumpPower = 50
        end
    end
end)

Section(moveTab, "Flight")
Toggle(moveTab, "Fly", false, function(on)
    if on then startFly() else stopFly() end
end)

-- ── ESP ──
Section(espTab, "Options")
Toggle(espTab, "Enable ESP", false, function(on)
    ESP.on = on
    if on then ensureContainer(); refreshESP() else destroyESP() end
end)
Toggle(espTab, "Team Check", true, function(on)
    ESP.teamCheck = on
    if ESP.on then refreshESP() end
end)
Section(espTab, "Info")
C("TextLabel",{
    BackgroundTransparency=1, Size=UDim2.new(1,0,0,60),
    Font=Enum.Font.Gotham,
    Text="Boxes refresh every second.\nTeam Check ON:  blue = your team, red = enemy.\nTeam Check OFF: all boxes gray.",
    TextColor3=T.Dim, TextSize=11, TextWrapped=true,
    TextXAlignment=Enum.TextXAlignment.Left,
    TextYAlignment=Enum.TextYAlignment.Top, Parent=espTab,
})

-- ── About ──
Section(aboutTab, "Info")
C("TextLabel",{
    BackgroundTransparency=1, Size=UDim2.new(1,0,0,70),
    Font=Enum.Font.Gotham,
    Text="Universal Hub v3.5.4\nby Nebula\n\nGames, Fly, ESP, Fast Walk, High Jump, Anti-AFK.",
    TextColor3=T.Dim, TextSize=11, TextWrapped=true,
    TextXAlignment=Enum.TextXAlignment.Left,
    TextYAlignment=Enum.TextYAlignment.Top, Parent=aboutTab,
})

spawnTask(function()
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
--  EXECUTION COUNTER
-- ═══════════════════════════════════════════════════════════════
local function postExecution()
    if not request then return nil end
    local ok, resp = pcall(function()
        return request({
            Url = RELAY_HTTP .. "/execution",
            Method = "POST",
            Headers = {["Content-Type"] = "application/json"},
            Body = HttpService:JSONEncode({ userId = LP.UserId, placeId = game.PlaceId }),
        })
    end)
    if not ok or not resp or not resp.Body then return nil end
    local ok2, data = pcall(HttpService.JSONDecode, HttpService, resp.Body)
    if ok2 and data and data.count then return data.count end
    return nil
end

local function fetchExecutions()
    local body = fetchUrl(RELAY_HTTP .. "/stats")
    if not body or body == "" then return nil end
    local ok, data = pcall(HttpService.JSONDecode, HttpService, body)
    if ok and data and data.executions then return data.executions end
    return nil
end

local function setExecDisplay(n)
    if execValueLbl and n then
        pcall(function() execValueLbl.Text = tostring(n) end)
    end
end

spawnTask(function()
    local count = postExecution()
    if count then
        setExecDisplay(count)
    else
        local read = fetchExecutions()
        if read then setExecDisplay(read) end
    end

    while true do
        waitTask(15)
        local read = fetchExecutions()
        if read then setExecDisplay(read) end
    end
end)

-- ═══════════════════════════════════════════════════════════════
--  BACKEND (relay — unchanged)
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
        local body = fetchUrl(RELAY_HTTP..path)
        if body and body ~= "" then
            local ok, data = pcall(HttpService.JSONDecode, HttpService, body)
            if ok then return data end
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
                spawnTask(handleExecute, data)
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
                spawnTask(handleExecute, data)
            elseif data.type == "ping" then
                send({type="pong",userId=LP.UserId})
            end
        end)
        ws.OnClose:Connect(function()
            connected = false
            waitTask(5)
            if transport == "ws" then
                transport = nil
                spawnTask(startHTTP)
            end
        end)
        return true
    end
    function startHTTP()
        transport = "http"
        spawnTask(function()
            while transport == "http" do
                local toSend = {}
                for _, m in ipairs(pendingOut) do table.insert(toSend, m) end
                pendingOut = {}
                for _, m in ipairs(toSend) do httpPost("/send", m) end
                local q = string.format("/poll?userId=%d&displayName=%s&placeId=%d&jobId=%s&gameId=%d",
                    LP.UserId, HttpService:UrlEncode(LP.DisplayName), game.PlaceId, game.JobId, game.GameId)
                local data = httpGet(q)
                if data and data.messages then processMessages(data.messages) end
                waitTask(2)
            end
        end)
    end
    spawnTask(function()
        for i = 1, 3 do if tryWS() then break end; waitTask(2) end
        if not connected then startHTTP() end
        waitTask(2)
        while true do
            waitTask(10)
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

    LP.CharacterAdded:Connect(function()
        waitTask(2)
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
