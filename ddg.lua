-- Duck Duck Goose Hub v4.2 — physical touch refined
local OK, ERR = pcall(function()

local Rayfield
for _, u in ipairs({
    "https://sirius.menu/rayfield",
    "https://raw.githubusercontent.com/shlexware/Rayfield/main/source",
    "https://github.com/shlexware/Rayfield/main/source",
}) do
    local ok, r = pcall(function()
        local f = loadstring(game:HttpGet(u))
        if not f then error("loadstring nil") end
        return f()
    end)
    if ok and r then Rayfield = r; break end
end
assert(Rayfield, "Rayfield failed to load")

local W = Rayfield:CreateWindow({
    Name = "Duck Duck Goose | v4.2",
    LoadingTitle = "Loading...",
    LoadingSubtitle = "physical touch refined",
    ConfigurationSaving = { Enabled = false },
    Discord = { Enabled = false },
    KeySystem = false,
})

local Players = game:GetService("Players")
local RS = game:GetService("ReplicatedStorage")
local Run = game:GetService("RunService")
local UIS = game:GetService("UserInputService")
local TS = game:GetService("TweenService")
local VU = game:GetService("VirtualUser")
local LP = Players.LocalPlayer
local RF = Rayfield.Flags

-- ============ REMOTES (kept for reference, not used for tagging) ============
local Netwire
pcall(function()
    Netwire = RS.src.Packages._Index["raild3x_netwire@0.3.4"].netwire.Remotes
end)
local AbilityRF = Netwire and Netwire.AbilityService.RF.UseAbility

local function useAbility(n)
    if AbilityRF then pcall(function() AbilityRF:InvokeServer(n) end) end
end

-- ============ GAME MODE ============
local gameModeDetected = "Unknown"
local function detectGameMode()
    local candidates = {}
    pcall(function() table.insert(candidates, RS.src.Systems.Game) end)
    pcall(function() table.insert(candidates, RS.src.Systems._STARTUP) end)
    pcall(function() table.insert(candidates, RS.src.Systems) end)
    pcall(function() table.insert(candidates, RS.src) end)
    for _, c in ipairs(candidates) do
        if c then
            local ok, attrs = pcall(function() return c:GetAttributes() end)
            if ok and attrs then
                for k, v in pairs(attrs) do
                    local kl = k:lower()
                    if (kl:find("mode") or kl:find("gamemode")) and type(v) == "string" then return v end
                end
            end
            for _, child in ipairs(c:GetChildren()) do
                local n = child.Name:lower()
                if n:find("mode") or n:find("gamemode") then
                    if child:IsA("StringValue") or child:IsA("ObjectValue") then return tostring(child.Value) end
                end
            end
        end
    end
    return "Unknown"
end
gameModeDetected = detectGameMode()

local gameModeOverride = "Auto"
local function currentMode()
    if gameModeOverride ~= "Auto" then return gameModeOverride end
    return gameModeDetected
end

-- ============ ROLE DETECTION ============
local function normRole(s)
    if type(s) ~= "string" then return nil end
    local l = s:lower()
    if l:find("goose") or l:find("infected") or l:find("zombie") then return "Goose" end
    if l:find("duck")  or l:find("survivor") or l:find("human")  then return "Duck"  end
    if l == "it" or l:find("chaser") or l:find("tagger") then return "Goose" end
    return nil
end

local function scanAttrs(i)
    if not i then return nil end
    local ok, a = pcall(function() return i:GetAttributes() end)
    if not ok or not a then return nil end
    for k, v in pairs(a) do
        local kl = k:lower()
        if type(v) == "boolean" then
            if kl:find("goose") or kl:find("infected") or kl:find("isit") or kl == "it" then return v and "Goose" or "Duck" end
            if kl:find("duck") or kl:find("survivor") then return v and "Duck" or "Goose" end
        elseif type(v) == "string" then
            local r = normRole(v); if r then return r end
        end
    end
    return nil
end

local function scanKids(i)
    if not i then return nil end
    for _, c in ipairs(i:GetChildren()) do
        local n = c.Name:lower()
        if n == "goose" or n:find("isgoose") or n:find("infected") then return "Goose" end
        if n == "duck" or n:find("isduck") or n:find("survivor") then return "Duck" end
    end
    return nil
end

local function scanLeaderstats(p)
    if not p then return nil end
    local ls = p:FindFirstChild("leaderstats") or p:FindFirstChild("Leaderstats")
    if not ls then return nil end
    for _, v in ipairs(ls:GetChildren()) do
        local n = v.Name:lower()
        if n:find("goose") or n:find("role") or n:find("team") or n:find("status") or n:find("infect") or n == "type" then
            local r = normRole(tostring(v.Value))
            if r then return r end
        end
    end
    return nil
end

local rc, rt = {}, {}
local function getRole(p, forceRefresh)
    if not p then return nil end
    local t = tick()
    if not forceRefresh and rc[p] and rt[p] and (t - rt[p] < 0.3) then return rc[p] end
    local r = scanAttrs(p) or scanAttrs(p.Character) or scanKids(p.Character)
        or scanLeaderstats(p) or (p.Team and normRole(p.Team.Name)) or nil
    rc[p] = r; rt[p] = t
    return r
end

local function hrp() local c = LP.Character; return c and c:FindFirstChild("HumanoidRootPart") end
local function hum() local c = LP.Character; return c and c:FindFirstChildOfClass("Humanoid") end
local function alive() local h = hum(); return h and h.Health > 0 end
local function hrpOf(p) return p and p.Character and p.Character:FindFirstChild("HumanoidRootPart") end

local roleOverride = "Auto"
local function me()
    if roleOverride == "Goose" then return "Goose" end
    if roleOverride == "Duck"  then return "Duck"  end
    return getRole(LP)
end

-- ============ ROLE LABEL ============
do
    local parent = (gethui and select(2, pcall(gethui))) or LP:FindFirstChild("PlayerGui")
    if parent then
        local g = Instance.new("ScreenGui")
        g.Name = "DDG_Role"; g.ResetOnSpawn = false; g.Parent = parent
        local l = Instance.new("TextLabel")
        l.Size = UDim2.new(0, 340, 0, 50)
        l.Position = UDim2.new(0.5, -170, 0, 8)
        l.BackgroundColor3 = Color3.fromRGB(20,20,20)
        l.BackgroundTransparency = 0.3
        l.TextColor3 = Color3.fromRGB(255,255,255)
        l.Font = Enum.Font.GothamBold
        l.TextSize = 16
        l.Text = "Role: ?"
        l.Parent = g
        task.spawn(function()
            while true do
                local r = me()
                local mode = currentMode()
                local roleStr = r or "?"
                local color = Color3.fromRGB(200,200,200)
                if r == "Goose" then color = Color3.fromRGB(255,200,60)
                elseif r == "Duck" then color = Color3.fromRGB(120,220,255) end
                l.TextColor3 = color
                l.Text = string.format("Mode: %s  |  Role: %s", mode, roleStr)
                task.wait(0.5)
            end
        end)
    end
end

-- ============ FLY ============
local VEL_NAME  = "DDG_FlyVelocity"
local GYRO_NAME = "DDG_FlyGyro"
local flyEnabled = false
local flySpeed = 1
local flyConn, flyCharConn, controlModule

local function getControlModule()
    if controlModule then return controlModule end
    local ok, mod = pcall(function()
        return require(LP.PlayerScripts:WaitForChild("PlayerModule"):WaitForChild("ControlModule"))
    end)
    if ok and mod then controlModule = mod end
    return controlModule
end

local function ensureFlyInstances(char)
    local r = char:WaitForChild("HumanoidRootPart", 5)
    if not r then return end
    if not r:FindFirstChild(VEL_NAME) then
        local bv = Instance.new("BodyVelocity")
        bv.Name = VEL_NAME; bv.MaxForce = Vector3.zero; bv.Velocity = Vector3.zero
        bv.Parent = r
    end
    if not r:FindFirstChild(GYRO_NAME) then
        local bg = Instance.new("BodyGyro")
        bg.Name = GYRO_NAME
        bg.MaxTorque = Vector3.new(9e9, 9e9, 9e9)
        bg.P = 1000; bg.D = 50; bg.CFrame = r.CFrame
        bg.Parent = r
    end
end

local function stopFly()
    flyEnabled = false
    if flyConn then flyConn:Disconnect(); flyConn = nil end
    if flyCharConn then flyCharConn:Disconnect(); flyCharConn = nil end
    local c = LP.Character
    if c then
        local r = c:FindFirstChild("HumanoidRootPart")
        if r then
            local bv = r:FindFirstChild(VEL_NAME);  if bv then bv:Destroy() end
            local bg = r:FindFirstChild(GYRO_NAME); if bg then bg:Destroy() end
        end
        local h = c:FindFirstChildOfClass("Humanoid")
        if h then h.PlatformStand = false end
    end
end

local function startFly()
    local c = LP.Character
    if not c or not c:FindFirstChild("HumanoidRootPart") then return end
    stopFly()
    flyEnabled = true
    getControlModule()
    ensureFlyInstances(c)
    local h = c:FindFirstChildOfClass("Humanoid")
    if h then h.PlatformStand = true end

    flyCharConn = LP.CharacterAdded:Connect(function(newChar)
        if not flyEnabled then return end
        task.wait(0.5)
        ensureFlyInstances(newChar)
        local nh = newChar:FindFirstChildOfClass("Humanoid")
        if nh then nh.PlatformStand = true end
    end)

    flyConn = Run.RenderStepped:Connect(function()
        if not flyEnabled then return end
        local cc = LP.Character; if not cc then return end
        local rr = cc:FindFirstChild("HumanoidRootPart")
        local hh = cc:FindFirstChildOfClass("Humanoid")
        if not rr or not hh or hh.Health <= 0 then return end
        local bv = rr:FindFirstChild(VEL_NAME)
        local bg = rr:FindFirstChild(GYRO_NAME)
        if not bv or not bg then ensureFlyInstances(cc); return end

        local cam = workspace.CurrentCamera
        bv.MaxForce = Vector3.new(9e9, 9e9, 9e9)
        bg.MaxTorque = Vector3.new(9e9, 9e9, 9e9)
        hh.PlatformStand = true
        bg.CFrame = cam.CFrame
        bv.Velocity = Vector3.zero

        local moveVec
        if controlModule then
            local ok, dir = pcall(function() return controlModule:GetMoveVector() end)
            if ok and dir and dir.Magnitude > 0.05 then
                moveVec = cam.CFrame.RightVector * dir.X - cam.CFrame.LookVector * dir.Z
            end
        end
        if not moveVec and hh.MoveDirection.Magnitude > 0.05 then
            local md = hh.MoveDirection
            local camLook = cam.CFrame.LookVector
            local horiz = Vector3.new(camLook.X, 0, camLook.Z)
            if horiz.Magnitude > 0.01 and math.abs(camLook.Y) > 0.15 then
                local fwd = md.Unit:Dot(horiz.Unit)
                moveVec = fwd > 0.2 and (md + Vector3.new(0, camLook.Y * fwd, 0)) or md
            else
                moveVec = md
            end
        end
        if moveVec and moveVec.Magnitude > 0.05 then
            bv.Velocity = moveVec * (flySpeed * 50)
        end
    end)
end

-- ============ FLYJUMP ============
local flyjumpConn
local function startFlyJump()
    if flyjumpConn then flyjumpConn:Disconnect() end
    flyjumpConn = UIS.JumpRequest:Connect(function()
        local c = LP.Character; if not c then return end
        local h = c:FindFirstChildOfClass("Humanoid")
        if h then pcall(function()
            h:SetStateEnabled(Enum.HumanoidStateType.Jumping, true)
            h:ChangeState(Enum.HumanoidStateType.Jumping)
        end) end
    end)
end
local function stopFlyJump()
    if flyjumpConn then flyjumpConn:Disconnect(); flyjumpConn = nil end
end

-- ============ INFINITE JUMP ============
local infJumpConn
local infJumpDebounce = false
local function startInfJump()
    if infJumpConn then infJumpConn:Disconnect() end
    infJumpDebounce = false
    infJumpConn = UIS.JumpRequest:Connect(function()
        if infJumpDebounce then return end
        infJumpDebounce = true
        local c = LP.Character
        if c then
            local h = c:FindFirstChildOfClass("Humanoid")
            if h then pcall(function()
                h:SetStateEnabled(Enum.HumanoidStateType.Jumping, true)
                h:ChangeState(Enum.HumanoidStateType.Jumping)
            end) end
        end
        task.wait(0.1)
        infJumpDebounce = false
    end)
end
local function stopInfJump()
    if infJumpConn then infJumpConn:Disconnect(); infJumpConn = nil end
end

-- ============ SPEED ============
local speedConn
local speedMult = 1.5
local speedEnabled = false
local function startSpeed()
    if speedConn then speedConn:Disconnect() end
    speedEnabled = true
    speedConn = Run.RenderStepped:Connect(function(dt)
        if not speedEnabled then return end
        local h = hum(); local r = hrp()
        if not h or not r or h.Health <= 0 then return end
        local md = h.MoveDirection
        if md.Magnitude > 0.05 then
            local base = h.WalkSpeed; if base <= 0 then base = 16 end
            local extra = (speedMult - 1) * base
            if extra > 0 then r.CFrame = r.CFrame + md * extra * dt end
        end
    end)
end
local function stopSpeed()
    speedEnabled = false
    if speedConn then speedConn:Disconnect(); speedConn = nil end
end

-- ============ TABS ============
local TagT  = W:CreateTab("Tag", 4483362458)
local AuraT = W:CreateTab("Aura", 4483362458)
local AbilT = W:CreateTab("Abilities", 4483362458)
local AutoT = W:CreateTab("Auto", 4483362458)
local MoveT = W:CreateTab("Move", 4483362458)
local PlayT = W:CreateTab("Players", 4483362458)
local MiscT = W:CreateTab("Misc", 4483362458)
local DbgT  = W:CreateTab("Debug", 4483362458)

-- ============ PHYSICAL TOUCH (v4.2 — with success detection) ============
local touchSettle = 0.10      -- how long to sit on top of the target
local touchOffset = 1.5       -- studs above target HRP
local touchPredict = 2        -- studs ahead in move direction

-- Cache: touches succeed if target role changes OR we see a HealthChanged event
local function touchPlayer(targetPlayer, returnCFrame, initialRole, settleTime)
    local myHRP = hrp()
    local targetHRP = hrpOf(targetPlayer)
    if not myHRP or not targetHRP then return false, "no_hrp" end

    local savedCFrame = returnCFrame or myHRP.CFrame
    local savedVel = myHRP.AssemblyLinearVelocity
    local settle = settleTime or touchSettle

    -- Snapshot target role BEFORE touch so we can detect a change
    local targetRoleBefore = getRole(targetPlayer, true)

    -- Predictive position: aim where the target WILL be
    local moveDir = targetHRP.AssemblyLinearVelocity or Vector3.zero
    local offset = Vector3.new(0, touchOffset, 0)
    if moveDir.Magnitude > 0.1 then
        offset = offset + (moveDir.Unit * touchPredict)
    end
    local touchPos = targetHRP.Position + offset

    -- TELEPORT to target — server sees us here on next replication tick
    myHRP.CFrame = CFrame.new(touchPos)
    myHRP.AssemblyLinearVelocity = Vector3.zero

    -- Wait for server to register the touch
    -- Break early if target's role already changed (tag succeeded)
    local elapsed = 0
    local step = 0.02
    local success = false
    while elapsed < settle do
        -- Bail if our own role changed unexpectedly
        if initialRole and me() ~= initialRole then
            if hrp() then
                myHRP.CFrame = savedCFrame
                myHRP.AssemblyLinearVelocity = savedVel
            end
            return false, "role_swapped"
        end

        -- Check if the target's role changed (they became goose / infected)
        local targetRoleNow = getRole(targetPlayer, true)
        if targetRoleBefore and targetRoleNow and targetRoleBefore ~= targetRoleNow then
            success = true
            break
        end

        task.wait(step)
        elapsed = elapsed + step
    end

    -- TELEPORT BACK
    if hrp() then
        myHRP.CFrame = savedCFrame
        myHRP.AssemblyLinearVelocity = savedVel
    end

    return true, success and "confirmed" or "unconfirmed"
end

-- ============ TAG ============
TagT:CreateSection("Manual")
local tagName = ""
TagT:CreateInput({ Name = "Target name", CurrentValue = "", PlaceholderText = "player name", RemoveTextAfterFocusLost = false, Callback = function(t) tagName = t end })
TagT:CreateButton({ Name = "Touch Target", Callback = function()
    local t = Players:FindFirstChild(tagName)
    if not t then Rayfield:Notify({Title="Tag",Content="Not found: "..tagName,Duration=3,Image=4483362458}); return end
    local ok, reason = touchPlayer(t, nil, me())
    Rayfield:Notify({Title="Tag",Content=ok and ("Touched "..t.Name.." ("..tostring(reason)..")") or ("Failed: "..tostring(reason)),Duration=3,Image=4483362458})
end })

-- ============ AURA ============
AuraT:CreateSection("Overrides")
AuraT:CreateDropdown({
    Name = "Manual Role",
    Options = {"Auto", "Goose", "Duck"}, CurrentOption = {"Auto"},
    MultipleOptions = false, Flag = "RoleOverride",
    Callback = function(o) roleOverride = o[1] end,
})
AuraT:CreateDropdown({
    Name = "Manual Mode",
    Options = {"Auto", "Classic", "Infection", "Unknown"}, CurrentOption = {"Auto"},
    MultipleOptions = false, Flag = "ModeOverride",
    Callback = function(o)
        gameModeOverride = o[1]
        Rayfield:Notify({Title="Mode", Content="Set to "..o[1], Duration=3, Image=4483362458})
    end,
})
AuraT:CreateLabel("Detected mode: " .. gameModeDetected)

AuraT:CreateSection("Config")

local auR = 15
local auD = 0.15
local auRoleFilter = "Loose"
local auMultiTarget = false
local auDebug = true
local auVis
local tagAllRadius = 15

local function getCylindricalDistance(pos1, pos2)
    local dx = pos1.X - pos2.X
    local dz = pos1.Z - pos2.Z
    return math.sqrt(dx*dx + dz*dz)
end

AuraT:CreateSlider({
    Name = "Detection Radius", Range = {3,80}, Increment = 1, Suffix = " studs",
    CurrentValue = 15, Flag = "AuR",
    Callback = function(v)
        auR = v
        tagAllRadius = v
        if auVis then auVis.Size = Vector3.new(0.4, v*2, v*2) end
    end,
})
AuraT:CreateSlider({ Name = "Loop delay", Range = {0.05,1}, Increment = 0.01, Suffix = "s", CurrentValue = 0.15, Flag = "AuD", Callback = function(v) auD = v end })
AuraT:CreateSlider({ Name = "Touch settle time", Range = {0.04,0.4}, Increment = 0.01, Suffix = "s", CurrentValue = 0.10, Flag = "AuSettle", Callback = function(v) touchSettle = v end })
AuraT:CreateSlider({ Name = "Touch offset (Y)", Range = {0.5,4}, Increment = 0.1, Suffix = " studs", CurrentValue = 1.5, Flag = "AuOffY", Callback = function(v) touchOffset = v end })
AuraT:CreateSlider({ Name = "Touch predict (move)", Range = {0,6}, Increment = 0.5, Suffix = " studs", CurrentValue = 2, Flag = "AuOffXZ", Callback = function(v) touchPredict = v end })

AuraT:CreateDropdown({
    Name = "Role Filter", Options = {"Strict","Loose","Off"},
    CurrentOption = {"Loose"}, MultipleOptions = false, Flag = "AuFilter",
    Callback = function(o) auRoleFilter = o[1] end,
})

AuraT:CreateToggle({ Name = "Multi-target (all in radius)", CurrentValue = false, Flag = "AuMulti", Callback = function(v) auMultiTarget = v end })
AuraT:CreateToggle({ Name = "Debug logging (F9)", CurrentValue = true, Flag = "AuDebug", Callback = function(v) auDebug = v end })

AuraT:CreateSection("Visual")
AuraT:CreateToggle({
    Name = "Show aura ring", CurrentValue = false, Flag = "AuVis",
    Callback = function(v)
        if v then
            if not auVis then
                auVis = Instance.new("Part")
                auVis.Name = "DDG_AuraRing"
                auVis.Shape = Enum.PartType.Cylinder
                auVis.Anchored = true
                auVis.CanCollide = false
                auVis.CanQuery = false
                auVis.CanTouch = false
                auVis.Massless = true
                auVis.CastShadow = false
                auVis.Locked = true
                auVis.Material = Enum.Material.Neon
                auVis.Color = Color3.fromRGB(255, 140, 40)
                auVis.Transparency = 0.85
                auVis.Size = Vector3.new(0.4, auR*2, auR*2)
                auVis.Parent = workspace
            end
            task.spawn(function()
                while auVis and auVis.Parent do
                    local h = hrp()
                    if h then
                        auVis.CFrame = CFrame.new(h.Position - Vector3.new(0, h.Size.Y/2 - 0.1, 0)) * CFrame.Angles(0, 0, math.rad(90))
                    end
                    task.wait()
                end
            end)
        else
            if auVis then auVis:Destroy(); auVis = nil end
        end
    end,
})

local function isTargetValid(p)
    local r = getRole(p)
    if auRoleFilter == "Off" then return true end
    if auRoleFilter == "Strict" then return r == "Duck" end
    return r ~= "Goose"
end

local function collectTargets()
    local h = hrp(); if not h then return {} end
    local list = {}
    for _, p in ipairs(Players:GetPlayers()) do
        if p ~= LP then
            local ph = hrpOf(p)
            local pu = p.Character and p.Character:FindFirstChildOfClass("Humanoid")
            if ph and pu and pu.Health > 0 then
                local d = getCylindricalDistance(ph.Position, h.Position)
                if d <= auR and isTargetValid(p) then
                    table.insert(list, {player = p, hrp = ph, dist = d})
                end
            end
        end
    end
    table.sort(list, function(a,b) return a.dist < b.dist end)
    return list
end

local function auraTick()
    if not alive() then return end
    local myR = me()
    local targets = collectTargets()
    if #targets == 0 then
        if auDebug then print("[AURA] no targets in radius") end
        return
    end
    if auDebug then
        print(string.format("[AURA] %d target(s), nearest=%s @ %.1f", #targets, targets[1].player.Name, targets[1].dist))
    end

    if auMultiTarget then
        for _, t in ipairs(targets) do
            local ok, reason = touchPlayer(t.player, nil, myR)
            if auDebug then
                print(string.format("[AURA]  touched %s -> %s", t.player.Name, tostring(reason)))
            end
            if reason == "role_swapped" then
                if auDebug then print("[AURA] role swapped — stopping loop") end
                return
            end
        end
    else
        local ok, reason = touchPlayer(targets[1].player, nil, myR)
        if auDebug then
            print(string.format("[AURA]  touched %s -> %s", targets[1].player.Name, tostring(reason)))
        end
    end
end

AuraT:CreateSection("Enable")
AuraT:CreateToggle({
    Name = "ENABLE AURA TAG", CurrentValue = false, Flag = "AuOn",
    Callback = function(v)
        if v then
            Rayfield:Notify({
                Title = "Aura Tag",
                Content = string.format("Mode=%s  Role=%s  Filter=%s", currentMode(), tostring(me() or "?"), auRoleFilter),
                Duration = 4, Image = 4483362458,
            })
            task.spawn(function()
                while RF.AuOn do
                    local ok, err = pcall(auraTick)
                    if not ok then warn("[AURA] tick error:", err) end
                    task.wait(auD)
                end
            end)
        end
    end,
})

-- ============ TAG ALL ============
TagT:CreateSection("Tag All (Infection)")
TagT:CreateButton({
    Name = "Touch ALL Players in Range",
    Callback = function()
        local h = hrp(); if not h then return end
        local savedCFrame = h.CFrame
        local savedVel = h.AssemblyLinearVelocity
        local count = 0
        local initialRole = me()
        local targets = collectTargets()
        for _, t in ipairs(targets) do
            if me() ~= initialRole then
                h.CFrame = savedCFrame
                h.AssemblyLinearVelocity = savedVel
                Rayfield:Notify({Title="Tag All", Content="Role swapped — stopped.", Duration=3, Image=4483362458})
                break
            end
            touchPlayer(t.player, savedCFrame, initialRole)
            count = count + 1
            task.wait(0.03)
        end
        if hrp() then h.CFrame = savedCFrame; h.AssemblyLinearVelocity = savedVel end
        Rayfield:Notify({Title="Tag All", Content=("Touched %d players"):format(count), Duration=3, Image=4483362458})
    end,
})
TagT:CreateButton({
    Name = "Touch ALL Ducks Server-Wide",
    Callback = function()
        local h = hrp(); if not h then return end
        local savedCFrame = h.CFrame
        local savedVel = h.AssemblyLinearVelocity
        local initialRole = me()
        local count = 0
        for _, p in ipairs(Players:GetPlayers()) do
            if me() ~= initialRole then
                h.CFrame = savedCFrame; h.AssemblyLinearVelocity = savedVel
                Rayfield:Notify({Title="Tag All", Content="Role swapped — stopped.", Duration=3, Image=4483362458})
                break
            end
            if p ~= LP then
                local r = getRole(p)
                if r == "Duck" or (r == nil and auRoleFilter ~= "Strict") then
                    if hrpOf(p) then
                        touchPlayer(p, savedCFrame, initialRole)
                        count = count + 1
                        task.wait(0.03)
                    end
                end
            end
        end
        if hrp() then h.CFrame = savedCFrame; h.AssemblyLinearVelocity = savedVel end
        Rayfield:Notify({Title="Tag All (Server)", Content=("Touched %d players"):format(count), Duration=3, Image=4483362458})
    end,
})

-- ============ ABILITIES ============
local dashInt = 0.1
AbilT:CreateSlider({ Name = "Dash spam interval", Range = {0.03,1}, Increment = 0.01, Suffix = "s", CurrentValue = 0.1, Flag = "DashInt", Callback = function(v) dashInt = v end })
AbilT:CreateButton({ Name = "Dash once", Callback = function() useAbility("Dash") end })
AbilT:CreateToggle({ Name = "Spam Dash", CurrentValue = false, Flag = "DashSpam", Callback = function(v)
    if v then task.spawn(function() while RF.DashSpam do useAbility("Dash"); task.wait(dashInt) end end) end
end })
local customAbility = "Dash"
AbilT:CreateInput({ Name = "Custom ability", CurrentValue = "Dash", PlaceholderText = "ability name", RemoveTextAfterFocusLost = false, Callback = function(t) customAbility = t end })
AbilT:CreateButton({ Name = "Use custom", Callback = function() useAbility(customAbility) end })

-- ============ AUTO EVADE ============
local evadeR = 30
AutoT:CreateSlider({ Name = "Evade radius", Range = {5,100}, Increment = 1, Suffix = " studs", CurrentValue = 30, Flag = "EvadeR", Callback = function(v) evadeR = v end })
AutoT:CreateToggle({ Name = "Auto Evade (Duck only)", CurrentValue = false, Flag = "AutoEvade", Callback = function(v)
    if v then task.spawn(function()
        while RF.AutoEvade do
            if me() == "Duck" then
                local h = hrp()
                if h then
                    local g, gd
                    for _, p in ipairs(Players:GetPlayers()) do
                        if p ~= LP and getRole(p) == "Goose" then
                            local ph = hrpOf(p)
                            if ph then
                                local d = getCylindricalDistance(ph.Position, h.Position)
                                if not gd or d < gd then g, gd = ph, d end
                            end
                        end
                    end
                    if g and gd < evadeR then
                        local dir = (h.Position - g.Position).Unit
                        local escapePos = h.Position + (dir * (evadeR + 5))
                        h.CFrame = CFrame.new(escapePos)
                    end
                end
            end
            task.wait(0.1)
        end
    end) end
end })

-- ============ MOVE ============
MoveT:CreateSection("Speed")
MoveT:CreateSlider({ Name = "Speed multiplier", Range = {1.0, 5.0}, Increment = 0.1, Suffix = "x", CurrentValue = 1.5, Flag = "SpdMult", Callback = function(v) speedMult = v end })
MoveT:CreateToggle({ Name = "Enable Speed", CurrentValue = false, Flag = "SpdOn", Callback = function(v)
    if v then startSpeed() else stopSpeed() end
end })

MoveT:CreateSection("Fly")
MoveT:CreateSlider({ Name = "Fly speed", Range = {0.2, 5}, Increment = 0.1, Suffix = "", CurrentValue = 1, Flag = "FlySpd", Callback = function(v) flySpeed = v end })
MoveT:CreateToggle({ Name = "Enable Fly", CurrentValue = false, Flag = "FlyOn", Callback = function(v) if v then startFly() else stopFly() end end })

MoveT:CreateSection("Fly Jump")
MoveT:CreateToggle({ Name = "FlyJump (hold jump)", CurrentValue = false, Flag = "FlyJump", Callback = function(v)
    if v then startFlyJump() else stopFlyJump() end
end })

MoveT:CreateSection("Infinite Jump")
MoveT:CreateToggle({ Name = "Infinite Jump", CurrentValue = false, Flag = "InfJmp", Callback = function(v)
    if v then startInfJump() else stopInfJump() end
end })

MoveT:CreateSection("Noclip")
MoveT:CreateToggle({ Name = "Noclip", CurrentValue = false, Flag = "Noclip", Callback = function() end })
Run.Stepped:Connect(function()
    if not RF.Noclip then return end
    local c = LP.Character; if not c then return end
    for _, p in ipairs(c:GetDescendants()) do if p:IsA("BasePart") and p.CanCollide then p.CanCollide = false end end
end )

-- ============ PLAYERS ============
local espOn = false
local espObjs = {}
local function applyESP(p)
    if p == LP then return end
    local ex = espObjs[p]
    if ex and (not ex.Parent or ex.Adornee ~= p.Character) then ex:Destroy(); espObjs[p] = nil end
    local c = p.Character
    if not c or espObjs[p] then return end
    local h = Instance.new("Highlight")
    h.Name = "DDG_ESP"
    local r = getRole(p)
    h.FillColor = r == "Goose" and Color3.fromRGB(255,60,60) or (r == "Duck" and Color3.fromRGB(60,170,255) or Color3.fromRGB(200,200,200))
    h.OutlineColor = Color3.fromRGB(255,255,255)
    h.FillTransparency = 0.55
    h.OutlineTransparency = 0
    h.Adornee = c
    h.Parent = c
    espObjs[p] = h
end
local function rmESP(p) if espObjs[p] then espObjs[p]:Destroy(); espObjs[p] = nil end end
local function refreshESP()
    for _, p in ipairs(Players:GetPlayers()) do
        if espOn and p ~= LP then
            applyESP(p)
            local h = espObjs[p]
            if h and h.Parent then
                local r = getRole(p)
                h.FillColor = r == "Goose" and Color3.fromRGB(255,60,60) or (r == "Duck" and Color3.fromRGB(60,170,255) or Color3.fromRGB(200,200,200))
            end
        else
            rmESP(p)
        end
    end
end
PlayT:CreateToggle({ Name = "Player ESP (Red=Goose / Blue=Duck)", CurrentValue = false, Flag = "ESP", Callback = function(v) espOn = v; refreshESP() end })
Players.PlayerAdded:Connect(function(p)
    p.CharacterAdded:Connect(function() if espOn then task.wait(0.5); applyESP(p) end end)
    p.CharacterRemoving:Connect(function() rmESP(p) end)
    if espOn then applyESP(p) end
end)
Players.PlayerRemoving:Connect(rmESP)
task.spawn(function()
    while true do
        if espOn then refreshESP() end
        task.wait(0.5)
    end
end)

local selP
local dd = PlayT:CreateDropdown({ Name = "Select player", Options = {"—"}, CurrentOption = {"—"}, MultipleOptions = false, Flag = "SelP", Callback = function(o) selP = o[1] end })
local function refreshList()
    local n = {}
    for _, p in ipairs(Players:GetPlayers()) do if p ~= LP then table.insert(n, p.Name) end end
    if #n == 0 then n = {"—"} end
    pcall(function() dd:Refresh(n) end)
end
refreshList()
Players.PlayerAdded:Connect(function() task.wait(0.5); refreshList() end)
Players.PlayerRemoving:Connect(function() task.wait(0.5); refreshList() end)

PlayT:CreateButton({ Name = "TP to selected", Callback = function()
    if not selP or selP == "—" then return end
    local t = Players:FindFirstChild(selP); local h = hrp(); local th = hrpOf(t)
    if h and th then h.CFrame = th.CFrame + Vector3.new(0,3,0) end
end })
PlayT:CreateButton({ Name = "Touch selected", Callback = function()
    if not selP or selP == "—" then return end
    local t = Players:FindFirstChild(selP); if not t then return end
    local ok, reason = touchPlayer(t, nil, me())
    Rayfield:Notify({Title="Tag",Content=ok and ("Touched "..t.Name.." ("..tostring(reason)..")") or ("Failed: "..tostring(reason)),Duration=3,Image=4483362458})
end })

-- ============ MISC ============
MiscT:CreateButton({ Name = "Reset character", Callback = function() local h = hum(); if h then h.Health = 0 end end })
MiscT:CreateButton({ Name = "Refill health", Callback = function() local h = hum(); if h then h.Health = h.MaxHealth end end })
MiscT:CreateToggle({ Name = "Anti-AFK", CurrentValue = false, Flag = "AntiAFK", Callback = function(v)
    if v then task.spawn(function()
        while RF.AntiAFK do
            pcall(function() VU:CaptureController(); VU:ClickButton2(Vector2.new()) end)
            task.wait(30)
        end
    end) end
end })

-- ============ DEBUG ============
DbgT:CreateButton({ Name = "Log all player roles", Callback = function()
    print("===== DDG Role Dump =====")
    print("Mode:", currentMode(), "(detected:", gameModeDetected, ")")
    for _, p in ipairs(Players:GetPlayers()) do print(p.Name, "->", tostring(getRole(p))) end
    print("=========================")
end })

Rayfield:LoadConfiguration()

end)

if not OK then
    warn("[DDG ERROR]", ERR)
    local parent = (gethui and select(2, pcall(gethui))) or game:GetService("Players").LocalPlayer:FindFirstChild("PlayerGui")
    if parent then
        local g = Instance.new("ScreenGui"); g.Name = "DDG_Err"; g.ResetOnSpawn = false; g.Parent = parent
        local f = Instance.new("Frame")
        f.Size = UDim2.new(0, 500, 0, 220)
        f.Position = UDim2.new(0.5, -250, 0.5, -110)
        f.BackgroundColor3 = Color3.fromRGB(25,25,25)
        f.Parent = g
        local t = Instance.new("TextLabel")
        t.Size = UDim2.new(1, -20, 1, -20)
        t.Position = UDim2.new(0, 10, 0, 10)
        t.BackgroundTransparency = 1
        t.TextColor3 = Color3.fromRGB(255,90,90)
        t.Font = Enum.Font.Code
        t.TextSize = 13
        t.TextWrapped = true
        t.TextXAlignment = Enum.TextXAlignment.Left
        t.TextYAlignment = Enum.TextYAlignment.Top
        t.Text = "DDG Hub error:\n\n" .. tostring(ERR)
        t.Parent = f
    end
end
