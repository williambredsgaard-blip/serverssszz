-- ═══════════════════════════════════════════════════════════════
--  Controller — Delta Hub  (fixed Bang + Join, dual-sided Fire/Smoke)
-- ═══════════════════════════════════════════════════════════════

do
    local SELF_URL = "https://serverssszz.onrender.com/controller.lua"
    local requeue = 'repeat task.wait() until game:IsLoaded() '
        .. 'local ok,err=pcall(function() loadstring(game:HttpGet("' .. SELF_URL .. '"))() end) '
        .. 'if not ok then warn("[Controller] requeue failed:",err) end'
    local qot = (syn and syn.queue_on_teleport) or queue_on_teleport
    if qot then pcall(qot, requeue) end
end

local Players  = game:GetService("Players")
local UserInputService = game:GetService("UserInputService")
local TweenService = game:GetService("TweenService")
local HttpService = game:GetService("HttpService")
local Teleport  = game:GetService("TeleportService")
local Market    = game:GetService("MarketplaceService")
local GuiSvc    = game:GetService("GuiService")
local LP = Players.LocalPlayer

local RELAY_WS   = "wss://serverssszz.onrender.com"
local RELAY_HTTP = "https://serverssszz.onrender.com"
local WebSocket  = WebSocket or (syn and syn.websocket) or nil
local loadstring = loadstring or nil
local request    = request or (syn and syn.request) or http_request
assert(loadstring, "Delta required (loadstring missing).")

local T = {
    Bg=Color3.fromRGB(18,18,22), Panel=Color3.fromRGB(28,28,34), Panel2=Color3.fromRGB(33,33,40),
    Hover=Color3.fromRGB(52,52,64), Accent=Color3.fromRGB(120,90,255),
    Text=Color3.fromRGB(238,238,242), Dim=Color3.fromRGB(150,150,165),
    Stroke=Color3.fromRGB(70,70,82), Stroke2=Color3.fromRGB(50,50,60),
    Good=Color3.fromRGB(85,200,120), Bad=Color3.fromRGB(230,90,90),
    Warning=Color3.fromRGB(230,180,90), Shadow=Color3.fromRGB(0,0,0),
    Glass=Color3.fromRGB(24,24,30),
}
local function C(c,p) local i=Instance.new(c) for k,v in pairs(p or {}) do if k~="Parent" then i[k]=v end end if p and p.Parent then i.Parent=p.Parent end return i end
local function corner(p,r) return C("UICorner",{CornerRadius=UDim.new(0,r or 5),Parent=p}) end
local function stroke(p,c,t,tr) return C("UIStroke",{Color=c or T.Stroke,Thickness=t or 1,Transparency=tr or 0,Parent=p}) end
local function pad(p,n,t) return C("UIPadding",{PaddingTop=UDim.new(0,t or n),PaddingBottom=UDim.new(0,t or n),PaddingLeft=UDim.new(0,n),PaddingRight=UDim.new(0,n),Parent=p}) end
local function tw(o,info,props) local t=TweenService:Create(o,info,props); t:Play(); return t end
local QI = TweenInfo.new(0.15, Enum.EasingStyle.Quad,  Enum.EasingDirection.Out)
local CI = TweenInfo.new(0.30, Enum.EasingStyle.Quart, Enum.EasingDirection.Out)

-- Window
local gui = C("ScreenGui",{Name="DeltaController",ResetOnSpawn=false,IgnoreGuiInset=true,ZIndexBehavior=Enum.ZIndexBehavior.Sibling,Parent=LP:WaitForChild("PlayerGui")})
local shadow = C("Frame",{BackgroundColor3=T.Shadow,BackgroundTransparency=1,Size=UDim2.new(0,500,0,360),Position=UDim2.new(0.5,-250,0.5,-166),ZIndex=0,Parent=gui})
corner(shadow,14)
local win = C("Frame",{BackgroundColor3=T.Glass,Size=UDim2.new(0,480,0,340),Position=UDim2.new(0.5,-240,0.5,-170),BackgroundTransparency=1,ZIndex=1,Parent=gui})
corner(win,10); stroke(win, T.Stroke, 1, 0.4)

local titleBar = C("Frame",{BackgroundColor3=T.Panel,BackgroundTransparency=1,Size=UDim2.new(1,0,0,26),BorderSizePixel=0,ZIndex=2,Parent=win})
corner(titleBar,10)
C("Frame",{BackgroundColor3=T.Panel,BackgroundTransparency=1,Size=UDim2.new(1,0,0,8),Position=UDim2.new(0,0,1,-8),BorderSizePixel=0,ZIndex=2,Parent=titleBar})
local titleDivider = C("Frame",{BackgroundColor3=T.Stroke2,BackgroundTransparency=1,Size=UDim2.new(1,0,0,1),Position=UDim2.new(0,0,1,-1),BorderSizePixel=0,ZIndex=3,Parent=titleBar})

local titleLbl = C("TextLabel",{BackgroundTransparency=1,Position=UDim2.new(0,14,0,0),Size=UDim2.new(0,220,1,0),Font=Enum.Font.GothamBold,Text="Delta Controller",TextColor3=T.Text,TextTransparency=1,TextSize=12,TextXAlignment=Enum.TextXAlignment.Left,ZIndex=3,Parent=titleBar})
local statusDot = C("Frame",{BackgroundColor3=T.Dim,BackgroundTransparency=1,Size=UDim2.new(0,6,0,6),Position=UDim2.new(1,-160,0.5,-3),BorderSizePixel=0,ZIndex=3,Parent=titleBar})
corner(statusDot,3)
local statusLbl = C("TextLabel",{BackgroundTransparency=1,Position=UDim2.new(1,-150,0,0),Size=UDim2.new(0,120,1,0),Font=Enum.Font.Gotham,Text="starting...",TextColor3=T.Dim,TextTransparency=1,TextSize=10,TextXAlignment=Enum.TextXAlignment.Left,ZIndex=3,Parent=titleBar})

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
    local w = math.max(measure.TextBounds.X + 22, 50)
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
local fullSize = UDim2.new(0,480,0,340)
local miniSize = UDim2.new(0,480,0,26)
minBtn.MouseButton1Click:Connect(function()
    minimized = not minimized
    tw(win, CI, {Size = minimized and miniSize or fullSize})
    tw(shadow, CI, {Size = minimized and UDim2.new(0,500,0,46) or UDim2.new(0,500,0,360)})
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
local function Label(parent, text)
    local l = C("TextLabel",{BackgroundTransparency=1,Size=UDim2.new(1,0,0,16),Font=Enum.Font.Gotham,Text=text,TextColor3=T.Text,TextSize=11,TextXAlignment=Enum.TextXAlignment.Left,TextWrapped=true,AutomaticSize=Enum.AutomaticSize.Y,Parent=parent})
    return { Set = function(_, t) l.Text = t end }
end
local function Button(parent, name, image, cb)
    local f = C("Frame",{BackgroundColor3=T.Panel,BackgroundTransparency=0.25,Size=UDim2.new(1,0,0,28),Parent=parent})
    corner(f,6); stroke(f, T.Stroke, 1, 0.5)
    local textX = 10; local img
    if image then
        img = C("ImageLabel",{BackgroundTransparency=1,Size=UDim2.new(0,18,0,18),Position=UDim2.new(0,8,0.5,-9),Image=image,Parent=f})
        corner(img,4); textX = 30
    end
    local lbl = C("TextLabel",{BackgroundTransparency=1,Position=UDim2.new(0,textX,0,0),Size=UDim2.new(1,-textX-20,1,0),Font=Enum.Font.Gotham,Text=name,TextColor3=T.Text,TextSize=11,TextXAlignment=Enum.TextXAlignment.Left,Parent=f})
    local dot = C("Frame",{BackgroundColor3=T.Warning,Size=UDim2.new(0,6,0,6),Position=UDim2.new(1,-16,0.5,-3),BorderSizePixel=0,Visible=false,Parent=f})
    corner(dot,3)
    local b = C("TextButton",{BackgroundTransparency=1,Size=UDim2.new(1,0,1,0),Text="",Parent=f})
    b.MouseEnter:Connect(function() tw(f, QI, {BackgroundTransparency=0.05,BackgroundColor3=T.Hover}) end)
    b.MouseLeave:Connect(function() tw(f, QI, {BackgroundTransparency=0.25,BackgroundColor3=T.Panel}) end)
    b.MouseButton1Down:Connect(function() tw(f, QI, {BackgroundTransparency=0,BackgroundColor3=T.Accent}) end)
    b.MouseButton1Up:Connect(function() tw(f, QI, {BackgroundTransparency=0.05,BackgroundColor3=T.Hover}) end)
    b.MouseButton1Click:Connect(function() dot.Visible = false; if cb then pcall(cb) end end)
    return { Instance = f, SetLabel = function(_, t) lbl.Text = t end, ShowDot = function() dot.Visible = true end }
end
local function MultiLine(parent, placeholder, height)
    local f = C("Frame",{BackgroundColor3=T.Panel,BackgroundTransparency=0.25,Size=UDim2.new(1,0,0,height or 130),Parent=parent})
    corner(f,6); stroke(f, T.Stroke, 1, 0.5)
    local box = C("TextBox",{BackgroundTransparency=1,Position=UDim2.new(0,10,0,8),Size=UDim2.new(1,-20,1,-16),Font=Enum.Font.Code,Text="",PlaceholderText=placeholder or "-- script",PlaceholderColor3=T.Dim,TextColor3=T.Text,TextSize=11,TextXAlignment=Enum.TextXAlignment.Left,TextYAlignment=Enum.TextYAlignment.Top,ClearTextOnFocus=false,MultiLine=true,TextWrapped=true,Parent=f})
    box.Focused:Connect(function() tw(f, QI, {BackgroundTransparency=0.1}) end)
    box.FocusLost:Connect(function() tw(f, QI, {BackgroundTransparency=0.25}) end)
    return { Get = function() return box.Text end }
end

local notifHolder = C("Frame",{BackgroundTransparency=1,Size=UDim2.new(0,240,1,-16),Position=UDim2.new(1,-10,0,10),AnchorPoint=Vector2.new(1,0),Parent=gui})
C("UIListLayout",{Padding=UDim.new(0,6),HorizontalAlignment=Enum.HorizontalAlignment.Right,VerticalAlignment=Enum.VerticalAlignment.Top,SortOrder=Enum.SortOrder.LayoutOrder,Parent=notifHolder})
local function notify(title, body, color)
    color = color or T.Accent
    local f = C("Frame",{BackgroundColor3=T.Panel,BackgroundTransparency=0.15,Size=UDim2.new(1,-6,0,48),Position=UDim2.new(1,24,0,0),Parent=notifHolder})
    corner(f,8); stroke(f, T.Stroke, 1, 0.4)
    C("Frame",{BackgroundColor3=color,Size=UDim2.new(0,3,1,-12),Position=UDim2.new(0,7,0.5,0),AnchorPoint=Vector2.new(0,0.5),BorderSizePixel=0,Parent=f})
    C("TextLabel",{BackgroundTransparency=1,Position=UDim2.new(0,16,0,7),Size=UDim2.new(1,-22,0,14),Font=Enum.Font.GothamBold,Text=title,TextColor3=T.Text,TextSize=11,TextXAlignment=Enum.TextXAlignment.Left,Parent=f})
    C("TextLabel",{BackgroundTransparency=1,Position=UDim2.new(0,16,0,22),Size=UDim2.new(1,-22,1,-26),Font=Enum.Font.Gotham,Text=body or "",TextColor3=T.Dim,TextSize=10,TextWrapped=true,TextXAlignment=Enum.TextXAlignment.Left,TextYAlignment=Enum.TextYAlignment.Top,Parent=f})
    tw(f, CI, {Position = UDim2.new(0,0,0,0)})
    task.delay(4, function()
        if not f.Parent then return end
        local t = tw(f, CI, {Position = UDim2.new(1,24,0,0), BackgroundTransparency = 1})
        t.Completed:Connect(function() f:Destroy() end)
    end)
end

local function setStatus(state, text)
    if state=="online" then statusDot.BackgroundColor3=T.Good
    elseif state=="http" then statusDot.BackgroundColor3=T.Warning
    elseif state=="connecting" then statusDot.BackgroundColor3=T.Warning
    else statusDot.BackgroundColor3=T.Dim end
    statusLbl.Text = text or state
end

task.spawn(function()
    tw(win, CI, {BackgroundTransparency = 0.15})
    tw(shadow, CI, {BackgroundTransparency = 0.55})
    tw(titleBar, CI, {BackgroundTransparency = 0.15})
    tw(titleLbl, CI, {TextTransparency = 0})
    tw(titleDivider, CI, {BackgroundTransparency = 0.6})
    tw(statusDot, CI, {BackgroundTransparency = 0})
    tw(statusLbl, CI, {TextTransparency = 0})
    tw(minBtn, CI, {BackgroundTransparency = 0, TextTransparency = 0})
    tw(closeBtn, CI, {BackgroundTransparency = 0, TextTransparency = 0})
    for _,p in ipairs(pages) do
        tw(p.btn, CI, {BackgroundTransparency = p.page.Visible and 0 or 0.3, TextTransparency = p.page.Visible and 0 or 0.2})
    end
end)

local thumbCache = {}
local function getThumb(uid)
    if thumbCache[uid] then return thumbCache[uid] end
    local ok, url = pcall(function() return Players:GetUserThumbnailAsync(uid, Enum.ThumbnailType.HeadShot, Enum.ThumbnailSize.Size100x100) end)
    thumbCache[uid] = ok and url or "rbxassetid://0"
    return thumbCache[uid]
end
local placeCache = {}
local function getPlaceName(pid)
    if not pid or pid == 0 then return "Unknown" end
    if placeCache[pid] then return placeCache[pid] end
    local ok, info = pcall(function() return Market:GetProductInfo(pid) end)
    placeCache[pid] = (ok and info and info.Name) or ("Place "..pid)
    return placeCache[pid]
end

local hubUsers = {}
local selectedUser = nil
local socket, connected = nil, false
local transport = nil
local debugLog = {}
local function log(msg)
    local line = "["..os.date("%H:%M:%S").."] "..tostring(msg)
    table.insert(debugLog, line)
    if #debugLog > 40 then table.remove(debugLog, 1) end
    warn("[Controller] "..tostring(msg))
end
local function httpPost(path, body)
    if not request then return nil end
    local ok, resp = pcall(function() return request({Url=RELAY_HTTP..path,Method="POST",Headers={["Content-Type"]="application/json"},Body=HttpService:JSONEncode(body)}) end)
    if ok and resp and resp.Body then local ok2, data = pcall(HttpService.JSONDecode, HttpService, resp.Body); if ok2 then return data end end
    return nil
end
local function httpGet(path)
    local ok, resp = pcall(function() return game:HttpGet(RELAY_HTTP..path) end)
    if ok and resp and resp ~= "" then local ok2, data = pcall(HttpService.JSONDecode, HttpService, resp); if ok2 then return data end end
    return nil
end
local function send(msg)
    if transport == "ws" and socket and connected then pcall(function() socket:Send(HttpService:JSONEncode(msg)) end)
    elseif transport == "http" then httpPost("/send", msg) end
end

-- ═══ TROLL STATE ═══
local trollEffects = {}
local function getEffects(uid)
    if not trollEffects[uid] then
        trollEffects[uid] = {fire=false, smoke=false, bang=false, freeze=false}
    end
    return trollEffects[uid]
end

-- ═══ LOCAL (controller-side) FIRE / SMOKE ═══
local localFire = {}
local localSmoke = {}

local function applyLocalFire(userId)
    local plr = Players:GetPlayerByUserId(userId)
    if not plr or not plr.Character then return end
    removeLocalFire(userId)
    localFire[userId] = {}
    for _, p in pairs(plr.Character:GetDescendants()) do
        if p:IsA("BasePart") then
            local f = Instance.new("Fire")
            f.Name = "TrollFireCtrl"
            f.Size = 8
            f.Heat = 10
            f.Color = Color3.fromRGB(255, 120, 30)
            f.SecondaryColor = Color3.fromRGB(255, 220, 120)
            f.Parent = p
            table.insert(localFire[userId], f)
        end
    end
end

local function removeLocalFire(userId)
    if localFire[userId] then
        for _, f in ipairs(localFire[userId]) do
            if f and f.Parent then f:Destroy() end
        end
    end
    localFire[userId] = nil
    local plr = Players:GetPlayerByUserId(userId)
    if plr and plr.Character then
        for _, p in pairs(plr.Character:GetDescendants()) do
            if p:IsA("Fire") and p.Name == "TrollFireCtrl" then p:Destroy() end
        end
    end
end

local function applyLocalSmoke(userId)
    local plr = Players:GetPlayerByUserId(userId)
    if not plr or not plr.Character then return end
    removeLocalSmoke(userId)
    localSmoke[userId] = {}
    for _, p in pairs(plr.Character:GetDescendants()) do
        if p:IsA("BasePart") then
            local s = Instance.new("Smoke")
            s.Name = "TrollSmokeCtrl"
            s.Size = 6
            s.Opacity = 0.5
            s.RiseVelocity = 3
            s.Color = Color3.fromRGB(120, 120, 120)
            s.Parent = p
            table.insert(localSmoke[userId], s)
        end
    end
end

local function removeLocalSmoke(userId)
    if localSmoke[userId] then
        for _, s in ipairs(localSmoke[userId]) do
            if s and s.Parent then s:Destroy() end
        end
    end
    localSmoke[userId] = nil
    local plr = Players:GetPlayerByUserId(userId)
    if plr and plr.Character then
        for _, p in pairs(plr.Character:GetDescendants()) do
            if p:IsA("Smoke") and p.Name == "TrollSmokeCtrl" then p:Destroy() end
        end
    end
end

-- ═══ TROLL SCRIPT SNIPPETS (sent to target) ═══
local SCRIPT_KILL = [[
local lp = game:GetService("Players").LocalPlayer
if lp.Character then
    local h = lp.Character:FindFirstChildOfClass("Humanoid")
    if h then h.Health = 0 end
end
]]

local SCRIPT_TRIP = [[
local lp = game:GetService("Players").LocalPlayer
local char = lp.Character
if char then
    local hum = char:FindFirstChildOfClass("Humanoid")
    local root = char:FindFirstChild("HumanoidRootPart")
    if hum and root then
        hum:ChangeState(Enum.HumanoidStateType.FallingDown)
        root.Velocity = root.CFrame.LookVector * 30
    end
end
]]

local SCRIPT_FREEZE = [[
local lp = game:GetService("Players").LocalPlayer
local char = lp.Character
if char then
    for _, p in pairs(char:GetDescendants()) do
        if p:IsA("BasePart") and not p.Anchored then p.Anchored = true end
    end
end
]]

local SCRIPT_UNFREEZE = [[
local lp = game:GetService("Players").LocalPlayer
local char = lp.Character
if char then
    for _, p in pairs(char:GetDescendants()) do
        if p:IsA("BasePart") and p.Anchored then p.Anchored = false end
    end
end
]]

-- ═══════════════════════════════════════════════════════════════
--  BANG  —  plays anim + continuously follows the controller
-- ═══════════════════════════════════════════════════════════════
local function SCRIPT_BANG(controllerId)
    return string.format([[
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local lp = Players.LocalPlayer
local char = lp.Character
if not char then return end
local hum = char:FindFirstChildOfClass("Humanoid")
if not hum then return end

-- Cleanup any previous bang on this client
if _G._IY_BangTrack then
    pcall(function() _G._IY_BangTrack:Stop() end)
    pcall(function() _G._IY_BangTrack:Destroy() end)
    _G._IY_BangTrack = nil
end
if _G._IY_BangLoop then
    pcall(function() _G._IY_BangLoop:Disconnect() end)
    _G._IY_BangLoop = nil
end

-- Load animation (R6 vs R15)
local animator = hum:FindFirstChildOfClass("Animator")
if not animator then
    animator = Instance.new("Animator")
    animator.Parent = hum
end
local anim = Instance.new("Animation")
if hum.RigType == Enum.HumanoidRigType.R15 then
    anim.AnimationId = "rbxassetid://5918726674"
else
    anim.AnimationId = "rbxassetid://148840371"
end
local ok, track = pcall(function() return animator:LoadAnimation(anim) end)
if not ok or not track then
    warn("[Troll Bang] Failed to load animation: " .. tostring(track))
    return
end
track.Priority = Enum.AnimationPriority.Action
track.Looped = true
pcall(function() track:Play(0.1, 1, 1) end)
pcall(function() track:AdjustSpeed(3) end)
_G._IY_BangTrack = track
_G._IY_BangAnim = anim

-- Follow the controller
local controller = Players:GetPlayerByUserId(%d)
if not controller then return end

local offset = CFrame.new(0, 0, 1.1)

_G._IY_BangLoop = RunService.Stepped:Connect(function()
    local myChar = lp.Character
    if not myChar then return end
    local myRoot = myChar:FindFirstChild("HumanoidRootPart")
    if not myRoot then return end

    local cChar = controller.Character
    if not cChar then return end
    local cTorso = cChar:FindFirstChild("Torso")
        or cChar:FindFirstChild("UpperTorso")
        or cChar:FindFirstChild("LowerTorso")
        or cChar:FindFirstChild("HumanoidRootPart")
    if not cTorso then return end

    myRoot.CFrame = cTorso.CFrame * offset
end)
]], controllerId)
end

local SCRIPT_UNBANG = [[
if _G._IY_BangTrack then
    pcall(function() _G._IY_BangTrack:Stop() end)
    pcall(function() _G._IY_BangTrack:Destroy() end)
    _G._IY_BangTrack = nil
end
if _G._IY_BangAnim then
    pcall(function() _G._IY_BangAnim:Destroy() end)
    _G._IY_BangAnim = nil
end
if _G._IY_BangLoop then
    pcall(function() _G._IY_BangLoop:Disconnect() end)
    _G._IY_BangLoop = nil
end
]]

local SCRIPT_FLING = [[
local lp = game:GetService("Players").LocalPlayer
local char = lp.Character
if char then
    for _, p in pairs(char:GetDescendants()) do
        if p:IsA("BasePart") then p.CanCollide = false end
    end
    local hrp = char:FindFirstChild("HumanoidRootPart")
    if hrp then
        local old = hrp:FindFirstChild("TrollFling")
        if old then old:Destroy() end
        local bav = Instance.new("BodyAngularVelocity")
        bav.Name = "TrollFling"
        bav.AngularVelocity = Vector3.new(999999, 999999, 999999)
        bav.MaxTorque = Vector3.new(math.huge, math.huge, math.huge)
        bav.P = 1250
        bav.Parent = hrp
        task.delay(4, function() if bav and bav.Parent then bav:Destroy() end end)
    end
end
]]

local SCRIPT_FIRE = [[
local lp = game:GetService("Players").LocalPlayer
local char = lp.Character
if not char then return end
for _, p in pairs(char:GetDescendants()) do
    if p:IsA("Fire") and p.Name == "TrollFire" then p:Destroy() end
end
for _, p in pairs(char:GetDescendants()) do
    if p:IsA("BasePart") then
        local f = Instance.new("Fire")
        f.Name = "TrollFire"
        f.Size = 8
        f.Heat = 10
        f.Parent = p
    end
end
]]

local SCRIPT_UNFIRE = [[
local lp = game:GetService("Players").LocalPlayer
local char = lp.Character
if not char then return end
for _, p in pairs(char:GetDescendants()) do
    if p:IsA("Fire") and p.Name == "TrollFire" then p:Destroy() end
end
]]

local SCRIPT_SMOKE = [[
local lp = game:GetService("Players").LocalPlayer
local char = lp.Character
if not char then return end
for _, p in pairs(char:GetDescendants()) do
    if p:IsA("Smoke") and p.Name == "TrollSmoke" then p:Destroy() end
end
for _, p in pairs(char:GetDescendants()) do
    if p:IsA("BasePart") then
        local s = Instance.new("Smoke")
        s.Name = "TrollSmoke"
        s.Size = 6
        s.Opacity = 0.5
        s.RiseVelocity = 3
        s.Parent = p
    end
end
]]

local SCRIPT_UNSMOKE = [[
local lp = game:GetService("Players").LocalPlayer
local char = lp.Character
if not char then return end
for _, p in pairs(char:GetDescendants()) do
    if p:IsA("Smoke") and p.Name == "TrollSmoke" then p:Destroy() end
end
]]

local function SCRIPT_HEADSIT(controllerId)
    return string.format([[
local Players = game:GetService("Players")
local lp = Players.LocalPlayer
local me = Players:GetPlayerByUserId(%d)
if not me or not me.Character then return end
if not lp.Character then return end
local hum = lp.Character:FindFirstChildOfClass("Humanoid")
if not hum then return end
hum.Sit = true
if _G._IY_HeadsitConn then _G._IY_HeadsitConn:Disconnect() end
_G._IY_HeadsitConn = game:GetService("RunService").Heartbeat:Connect(function()
    local controllerChar = me.Character
    local myChar = lp.Character
    if not controllerChar or not myChar then
        _G._IY_HeadsitConn:Disconnect()
        return
    end
    local controllerRoot = controllerChar:FindFirstChild("HumanoidRootPart")
    local myRoot = myChar:FindFirstChild("HumanoidRootPart")
    local myHum = myChar:FindFirstChildOfClass("Humanoid")
    if controllerRoot and myRoot and myHum and myHum.Sit then
        myRoot.CFrame = controllerRoot.CFrame * CFrame.new(0, 1.6, 0.4)
    else
        _G._IY_HeadsitConn:Disconnect()
    end
end)
]], controllerId)
end

local function SCRIPT_BRING(myId)
    return string.format([[
local me = game:GetService("Players"):GetPlayerByUserId(%d)
if not me or not me.Character then return end
local myHRP = me.Character:FindFirstChild("HumanoidRootPart")
if not myHRP then return end
local lp = game:GetService("Players").LocalPlayer
if not lp.Character then return end
local h = lp.Character:FindFirstChild("HumanoidRootPart")
if h then h.CFrame = myHRP.CFrame * CFrame.new(0, 3, 0) end
]], myId)
end

-- ═══ Tabs ═══
local playersTab = makeTab("PLAYERS")
local joinTab    = makeTab("JOIN")
local execTab    = makeTab("EXEC")
local trollTab   = makeTab("TROLL")
local outTab     = makeTab("OUTPUT")
local debugTab   = makeTab("DEBUG")

-- ═══ JOIN HELPER ═══
-- Tries multiple methods to actually open Roblox on the target place.
-- GuiSvc:OpenBrowserWindow returns a boolean (true=opened, false=failed),
-- so we must check the return value, not just whether the call threw.
local function tryJoinPlace(placeId, jobId)
    placeId = tonumber(placeId)
    if not placeId then return false, "invalid placeId" end

    local robloxDeeplink
    if jobId and jobId ~= "" then
        robloxDeeplink = "roblox://experiences/start?placeId=" .. tostring(placeId)
            .. "&gameInstanceId=" .. tostring(jobId)
    else
        robloxDeeplink = "roblox://placeId=" .. tostring(placeId)
    end

    local httpsDeeplink = "https://www.roblox.com/games/start?placeId=" .. tostring(placeId)
    if jobId and jobId ~= "" then
        httpsDeeplink = httpsDeeplink .. "&gameInstanceId=" .. tostring(jobId)
    end

    local attempts = {
        {
            name = "GuiSvc roblox://",
            run = function()
                if not GuiSvc or not GuiSvc.OpenBrowserWindow then return false end
                local ok, res = pcall(function() return GuiSvc:OpenBrowserWindow(robloxDeeplink) end)
                return ok and res == true
            end
        },
        {
            name = "GuiSvc https",
            run = function()
                if not GuiSvc or not GuiSvc.OpenBrowserWindow then return false end
                local ok, res = pcall(function() return GuiSvc:OpenBrowserWindow(httpsDeeplink) end)
                return ok and res == true
            end
        },
        {
            name = "request roblox://",
            run = function()
                if not request then return false end
                local ok = pcall(function() request({Url = robloxDeeplink, Method = "GET"}) end)
                return ok
            end
        },
        {
            name = "TeleportService",
            run = function()
                local ok = pcall(function()
                    if jobId and jobId ~= "" then
                        Teleport:TeleportToPlaceInstance(placeId, jobId, LP)
                    else
                        Teleport:Teleport(placeId, LP)
                    end
                end)
                return ok
            end
        },
    }

    for _, a in ipairs(attempts) do
        local success = a.run()
        log("[Join] " .. a.name .. " → " .. tostring(success))
        if success then return true, a.name end
    end
    return false, "all methods failed"
end

-- JOIN
Section(joinTab, "Selected Player")
local joinLabel = Label(joinTab, "Select a player.")
Section(joinTab, "Step 1 — Enter the game")
Button(joinTab, "Join Game (any server)", nil, function()
    if not selectedUser then notify("Error","No player selected.",T.Bad); return end
    if not selectedUser.placeId or selectedUser.placeId == 0 then notify("Error","No place info available.",T.Bad); return end

    local placeName = getPlaceName(selectedUser.placeId)
    local ok, method = tryJoinPlace(selectedUser.placeId, nil)

    if ok then
        notify("Joining Game", "Launching " .. placeName .. " (" .. method .. ")...", T.Good)
    else
        local cb = setclipboard or toclipboard or set_clipboard or (Clipboard and Clipboard.set)
        local deeplink = "roblox://placeId=" .. tostring(selectedUser.placeId)
        if cb then
            pcall(cb, deeplink)
            notify("Could Not Auto-Join", "Deeplink copied — paste it in your browser", T.Warning)
        else
            notify("Join Failed", "Could not launch " .. placeName, T.Bad)
        end
    end
end)
Section(joinTab, "Step 2 — Join their exact server")
Button(joinTab, "Join Player's Server", nil, function()
    if not selectedUser then notify("Error","No player selected.",T.Bad); return end
    if not selectedUser.jobId or selectedUser.jobId == "" then notify("Error","No server info.",T.Bad); return end
    if game.PlaceId ~= selectedUser.placeId then
        notify("Not in place", "Use 'Join Game (any server)' first.", T.Warning)
    end

    local ok, method = tryJoinPlace(selectedUser.placeId, selectedUser.jobId)

    if ok then
        notify("Joining Server", "Connecting to " .. selectedUser.displayName .. "'s server (" .. method .. ")...", T.Good)
    else
        local cb = setclipboard or toclipboard or set_clipboard or (Clipboard and Clipboard.set)
        local deeplink = "roblox://experiences/start?placeId=" .. tostring(selectedUser.placeId)
            .. "&gameInstanceId=" .. tostring(selectedUser.jobId)
        if cb then
            pcall(cb, deeplink)
            notify("Could Not Auto-Join", "Deeplink copied — paste it in your browser", T.Warning)
        else
            notify("Join Failed", "Restricted or unauthorized.", T.Bad)
        end
    end
end)

-- EXEC
Section(execTab, "Target")
local execTargetLabel = Label(execTab, "No target selected.")
Section(execTab, "Script")
local execInput = MultiLine(execTab, "-- script to run on target", 130)
Section(execTab, "Actions")
Button(execTab, "Execute on Target", nil, function()
    if not selectedUser then notify("No Target","Pick a target.",T.Bad); return end
    local code = execInput:Get()
    if code == "" then notify("Empty","Write a script.",T.Bad); return end
    send({ type="execute", targetUserId=selectedUser.userId, script=code, fromUserId=LP.UserId })
    notify("Dispatched","Sent to "..selectedUser.displayName,T.Good)
end)

-- ═══ TROLL ═══
Section(trollTab, "Target")
local trollTargetLabel = Label(trollTab, "No target selected. Pick one in PLAYERS.")

Section(trollTab, "Character")
Button(trollTab, "Kill", nil, function()
    if not selectedUser then notify("No Target","Pick a target in PLAYERS.",T.Bad); return end
    send({ type="execute", targetUserId=selectedUser.userId, script=SCRIPT_KILL, fromUserId=LP.UserId })
    notify("Kill sent", selectedUser.displayName, T.Warning)
end)
Button(trollTab, "Fling (spam it)", nil, function()
    if not selectedUser then notify("No Target","Pick a target in PLAYERS.",T.Bad); return end
    send({ type="execute", targetUserId=selectedUser.userId, script=SCRIPT_FLING, fromUserId=LP.UserId })
    notify("Fling sent", selectedUser.displayName, T.Warning)
end)
Button(trollTab, "Trip (stumble)", nil, function()
    if not selectedUser then notify("No Target","Pick a target in PLAYERS.",T.Bad); return end
    send({ type="execute", targetUserId=selectedUser.userId, script=SCRIPT_TRIP, fromUserId=LP.UserId })
    notify("Trip sent", selectedUser.displayName, T.Warning)
end)

local freezeBtn, bangBtn, fireBtn, smokeBtn

local function refreshTrollButtons()
    if not freezeBtn then return end
    if not selectedUser then
        freezeBtn:SetLabel("Freeze")
        bangBtn:SetLabel("Bang")
        fireBtn:SetLabel("Fire")
        smokeBtn:SetLabel("Smoke")
        return
    end
    local eff = getEffects(selectedUser.userId)
    freezeBtn:SetLabel(eff.freeze and "Unfreeze" or "Freeze")
    bangBtn:SetLabel(eff.bang   and "Unbang"   or "Bang")
    fireBtn:SetLabel(eff.fire   and "Unfire"   or "Fire")
    smokeBtn:SetLabel(eff.smoke and "Unsmoke"  or "Smoke")
end

freezeBtn = Button(trollTab, "Freeze", nil, function()
    if not selectedUser then notify("No Target","Pick a target in PLAYERS.",T.Bad); return end
    local eff = getEffects(selectedUser.userId)
    if eff.freeze then
        send({ type="execute", targetUserId=selectedUser.userId, script=SCRIPT_UNFREEZE, fromUserId=LP.UserId })
        eff.freeze = false
        notify("Unfrozen", selectedUser.displayName, T.Good)
    else
        send({ type="execute", targetUserId=selectedUser.userId, script=SCRIPT_FREEZE, fromUserId=LP.UserId })
        eff.freeze = true
        notify("Frozen", selectedUser.displayName, T.Warning)
    end
    refreshTrollButtons()
end)

Button(trollTab, "Headsit on Me", nil, function()
    if not selectedUser then notify("No Target","Pick a target in PLAYERS.",T.Bad); return end
    send({ type="execute", targetUserId=selectedUser.userId, script=SCRIPT_HEADSIT(LP.UserId), fromUserId=LP.UserId })
    notify("Headsit sent", selectedUser.displayName .. " is now on your head", T.Warning)
end)

Section(trollTab, "Animation")
bangBtn = Button(trollTab, "Bang", nil, function()
    if not selectedUser then notify("No Target","Pick a target in PLAYERS.",T.Bad); return end
    local eff = getEffects(selectedUser.userId)
    if eff.bang then
        send({ type="execute", targetUserId=selectedUser.userId, script=SCRIPT_UNBANG, fromUserId=LP.UserId })
        eff.bang = false
        notify("Unbang sent", selectedUser.displayName, T.Good)
    else
        send({ type="execute", targetUserId=selectedUser.userId, script=SCRIPT_BANG(LP.UserId), fromUserId=LP.UserId })
        eff.bang = true
        notify("Bang sent", selectedUser.displayName .. " is now following you", T.Warning)
    end
    refreshTrollButtons()
end)

Section(trollTab, "Effects (dual-sided)")
fireBtn = Button(trollTab, "Fire", nil, function()
    if not selectedUser then notify("No Target","Pick a target in PLAYERS.",T.Bad); return end
    local eff = getEffects(selectedUser.userId)
    if eff.fire then
        send({ type="execute", targetUserId=selectedUser.userId, script=SCRIPT_UNFIRE, fromUserId=LP.UserId })
        removeLocalFire(selectedUser.userId)
        eff.fire = false
        notify("Unfire sent", selectedUser.displayName, T.Good)
    else
        send({ type="execute", targetUserId=selectedUser.userId, script=SCRIPT_FIRE, fromUserId=LP.UserId })
        applyLocalFire(selectedUser.userId)
        eff.fire = true
        notify("Fire on (visible to both)", selectedUser.displayName, T.Warning)
    end
    refreshTrollButtons()
end)
smokeBtn = Button(trollTab, "Smoke", nil, function()
    if not selectedUser then notify("No Target","Pick a target in PLAYERS.",T.Bad); return end
    local eff = getEffects(selectedUser.userId)
    if eff.smoke then
        send({ type="execute", targetUserId=selectedUser.userId, script=SCRIPT_UNSMOKE, fromUserId=LP.UserId })
        removeLocalSmoke(selectedUser.userId)
        eff.smoke = false
        notify("Unsmoke sent", selectedUser.displayName, T.Good)
    else
        send({ type="execute", targetUserId=selectedUser.userId, script=SCRIPT_SMOKE, fromUserId=LP.UserId })
        applyLocalSmoke(selectedUser.userId)
        eff.smoke = true
        notify("Smoke on (visible to both)", selectedUser.displayName, T.Warning)
    end
    refreshTrollButtons()
end)

Section(trollTab, "Position")
Button(trollTab, "Goto (me → them)", nil, function()
    if not selectedUser then notify("No Target","Pick a target in PLAYERS.",T.Bad); return end
    local targetPlr = Players:GetPlayerByUserId(selectedUser.userId)
    if not targetPlr then notify("Not in server","You must be in the same server.",T.Bad); return end
    local myChar = LP.Character
    local tChar = targetPlr.Character
    local myHRP = myChar and myChar:FindFirstChild("HumanoidRootPart")
    local tHRP = tChar and tChar:FindFirstChild("HumanoidRootPart")
    if not myHRP or not tHRP then notify("Error","Character not found.",T.Bad); return end
    myHRP.CFrame = tHRP.CFrame * CFrame.new(0, 3, 0)
    notify("Teleported","To "..targetPlr.DisplayName, T.Good)
end)
Button(trollTab, "Bring (them → me)", nil, function()
    if not selectedUser then notify("No Target","Pick a target in PLAYERS.",T.Bad); return end
    local targetPlr = Players:GetPlayerByUserId(selectedUser.userId)
    if not targetPlr then notify("Not in server","You must be in the same server.",T.Bad); return end
    send({ type="execute", targetUserId=selectedUser.userId, script=SCRIPT_BRING(LP.UserId), fromUserId=LP.UserId })
    notify("Bring sent", targetPlr.DisplayName, T.Good)
end)

-- OUTPUT
Section(outTab, "Live Output")
local outputLabel = Label(outTab, "No output yet.")
Button(outTab, "Clear", nil, function() outputLabel:Set("—") end)

-- DEBUG
Section(debugTab, "Connection")
local debugInfo = Label(debugTab, "starting...")
Section(debugTab, "Recent Log")
local debugLogLbl = Label(debugTab, "no logs yet")

-- PLAYERS
Section(playersTab, "Connected Clients")
local playerButtons = {}

local function buildPlayerButton(uid, u)
    local thumb = getThumb(uid)
    local pname = getPlaceName(u.placeId)
    local label = u.displayName.." — "..pname
    if uid == LP.UserId then label = label.."  (you)" end
    if playerButtons[uid] then playerButtons[uid].SetLabel(playerButtons[uid], label); return end
    playerButtons[uid] = Button(playersTab, label, thumb, function()
        selectedUser = u
        joinLabel:Set("Selected: "..u.displayName.."\nGame: "..pname.."\nPlace ID: "..tostring(u.placeId).."\nJob ID: "..tostring(u.jobId))
        execTargetLabel:Set("Target: "..u.displayName.."  (@"..tostring(u.userId)..")")
        trollTargetLabel:Set("Target: "..u.displayName.."  (@"..tostring(u.userId)..")")
        refreshTrollButtons()
        notify("Selected", u.displayName, T.Accent)
    end)
end
local function refreshPlayerList()
    for uid, u in pairs(hubUsers) do buildPlayerButton(uid, u) end
    for uid, btn in pairs(playerButtons) do
        if not hubUsers[uid] then
            if btn.Instance then btn.Instance:Destroy() end
            playerButtons[uid] = nil
            if selectedUser and selectedUser.userId == uid then
                selectedUser = nil
                joinLabel:Set("Selected player disconnected.")
                execTargetLabel:Set("No target selected.")
                trollTargetLabel:Set("No target selected.")
                refreshTrollButtons()
            end
            removeLocalFire(uid)
            removeLocalSmoke(uid)
            trollEffects[uid] = nil
        end
    end
end

local refreshBar = C("Frame",{BackgroundTransparency=1,Size=UDim2.new(1,0,0,0),AutomaticSize=Enum.AutomaticSize.Y,Parent=playersTab})
C("UIListLayout",{Padding=UDim.new(0,5),SortOrder=Enum.SortOrder.LayoutOrder,Parent=refreshBar})
Button(refreshBar, "Refresh List", nil, function()
    if transport == "ws" then
        send({type="requestUserList", userId=LP.UserId})
        notify("Refreshing", "Requested fresh user list", T.Accent)
    else
        task.spawn(function()
            local q = string.format("/poll?userId=%d&displayName=%s&placeId=%d&jobId=%s&gameId=%d",
                LP.UserId, HttpService:UrlEncode(LP.DisplayName), game.PlaceId, game.JobId, game.GameId)
            local data = httpGet(q)
            if data and data.users then
                local newUsers = {}
                for _, u in ipairs(data.users) do newUsers[u.userId] = u end
                hubUsers = newUsers
                refreshPlayerList()
            end
        end)
        notify("Refreshing", "Polled relay for fresh list", T.Accent)
    end
end)

-- Handlers
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

local function handleMessage(data)
    if data.type == "userList" then
        hubUsers = {}
        for _, u in ipairs(data.users or {}) do hubUsers[u.userId] = u end
        refreshPlayerList()
    elseif data.type == "userJoined" then
        hubUsers[data.userId] = data; refreshPlayerList()
        if data.userId ~= LP.UserId then notify("Client Connected", data.displayName or ("User "..data.userId), T.Good) end
    elseif data.type == "userLeft" then
        local gone = hubUsers[data.userId]
        hubUsers[data.userId] = nil
        removeLocalFire(data.userId)
        removeLocalSmoke(data.userId)
        trollEffects[data.userId] = nil
        if selectedUser and selectedUser.userId == data.userId then
            selectedUser = nil
            joinLabel:Set("Selected player disconnected.")
            execTargetLabel:Set("No target selected.")
            trollTargetLabel:Set("No target selected.")
            refreshTrollButtons()
        end
        refreshPlayerList()
        if gone and data.userId ~= LP.UserId then notify("Client Disconnected", gone.displayName or ("User "..data.userId), T.Bad) end
    elseif data.type == "ping" then
        local prev = hubUsers[data.userId]
        local isNew = (prev == nil)
        local changed = prev and (prev.placeId ~= data.placeId or prev.jobId ~= data.jobId)
        hubUsers[data.userId] = data
        refreshPlayerList()

        if data.respawned then
            removeLocalFire(data.userId)
            removeLocalSmoke(data.userId)
            trollEffects[data.userId] = {fire=false, smoke=false, bang=false, freeze=false}
            if selectedUser and selectedUser.userId == data.userId then
                refreshTrollButtons()
            end
            notify("Target Respawned", (data.displayName or ("User "..data.userId)).."'s effects cleared", T.Warning)
        end

        if not isNew and changed then
            notify("Server Hop", (data.displayName or ("User "..data.userId)).." → "..getPlaceName(data.placeId), T.Warning)
            if playerButtons[data.userId] then playerButtons[data.userId].ShowDot() end
        end
    elseif data.type == "execute" then
        if data.targetUserId == LP.UserId then task.spawn(handleExecute, data) end
    elseif data.type == "output" then
        if data.targetUserId == LP.UserId then
            outputLabel:Set("Output:\n"..tostring(data.output or "—").."\n\nError:\n"..tostring(data.error or "—"))
        end
    end
end

local function tryWS()
    if not WebSocket then log("WebSocket not available"); return false end
    log("Attempting WebSocket → "..RELAY_WS)
    local ok, ws = pcall(function() return WebSocket.connect(RELAY_WS) end)
    if not ok or not ws then log("WS connect failed: "..tostring(ws)); return false end
    socket = ws; connected = true; transport = "ws"
    setStatus("online", "ws online"); log("WebSocket connected")
    pcall(function() ws:Send(HttpService:JSONEncode({
        type="identify",userId=LP.UserId,displayName=LP.DisplayName,
        placeId=game.PlaceId,jobId=game.JobId,gameId=game.GameId,
    })) end)
    ws.OnMessage:Connect(function(raw)
        local ok2, data = pcall(HttpService.JSONDecode, HttpService, raw)
        if not ok2 or not data then return end
        handleMessage(data)
    end)
    ws.OnClose:Connect(function()
        log("WebSocket closed"); connected = false
        if transport == "ws" then
            setStatus("connecting", "reconnecting..."); task.wait(5)
            if not tryWS() then transport = nil; task.spawn(startHTTP) end
        end
    end)
    return true
end

function startHTTP()
    transport = "http"
    setStatus("http", "http online")
    log("Starting HTTP polling")
    task.spawn(function()
        while transport == "http" do
            local q = string.format("/poll?userId=%d&displayName=%s&placeId=%d&jobId=%s&gameId=%d",
                LP.UserId, HttpService:UrlEncode(LP.DisplayName), game.PlaceId, game.JobId, game.GameId)
            local data = httpGet(q)
            if data then
                if data.messages then for _, m in ipairs(data.messages) do handleMessage(m) end end
                if data.users then
                    local newUsers = {}
                    for _, u in ipairs(data.users) do newUsers[u.userId] = u end
                    hubUsers = newUsers
                    refreshPlayerList()
                end
            end
            task.wait(1)
        end
    end)
end

refreshPlayerList()
setStatus("connecting", "starting...")

task.spawn(function()
    task.spawn(function()
        while true do
            task.wait(1)
            local count = 0
            for _ in pairs(hubUsers) do count = count + 1 end
            debugInfo:Set("Transport: "..(transport or "none").."\nConnected: "..tostring(connected).."\nUserID: "..tostring(LP.UserId).."\nUsers online: "..count)
            local start = math.max(1, #debugLog - 8)
            local recent = {}
            for i = start, #debugLog do table.insert(recent, debugLog[i]) end
            debugLogLbl:Set(#recent > 0 and table.concat(recent, "\n") or "no logs yet")
            if transport == "ws" then setStatus("online", "ws | "..count.." users")
            elseif transport == "http" then setStatus("http", "http | "..count.." users")
            else setStatus("connecting", "connecting...") end
        end
    end)
    local wsOk = false
    for i = 1, 3 do if tryWS() then wsOk = true; break end; log("WS attempt "..i.." failed"); task.wait(2) end
    if not wsOk then log("All WS attempts failed, switching to HTTP"); startHTTP() end
    while true do
        task.wait(15)
        if transport == "ws" then
            send({type="ping",userId=LP.UserId,displayName=LP.DisplayName,placeId=game.PlaceId,jobId=game.JobId,gameId=game.GameId,ts=os.time()})
        end
    end
end)

notify("Controller Starting", "Connecting to relay...", T.Accent)
