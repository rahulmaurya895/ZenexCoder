from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    PageBreak,
    ListFlowable,
    ListItem,
)


BASE = Path(r"D:\nexCode\nexcode")
OUT_DIR = BASE / "output" / "pdf"
OUT_DIR.mkdir(parents=True, exist_ok=True)
PDF_PATH = OUT_DIR / "NexCode-User-Manual.pdf"


styles = getSampleStyleSheet()
title = ParagraphStyle(
    "TitleCustom",
    parent=styles["Title"],
    fontName="Helvetica-Bold",
    fontSize=24,
    leading=28,
    textColor=colors.HexColor("#111827"),
    alignment=TA_LEFT,
    spaceAfter=10,
)
h1 = ParagraphStyle(
    "H1Custom",
    parent=styles["Heading1"],
    fontName="Helvetica-Bold",
    fontSize=15,
    leading=19,
    textColor=colors.HexColor("#111827"),
    spaceBefore=10,
    spaceAfter=6,
)
h2 = ParagraphStyle(
    "H2Custom",
    parent=styles["Heading2"],
    fontName="Helvetica-Bold",
    fontSize=11.5,
    leading=14,
    textColor=colors.HexColor("#1f2937"),
    spaceBefore=8,
    spaceAfter=4,
)
body = ParagraphStyle(
    "BodyCustom",
    parent=styles["BodyText"],
    fontName="Helvetica",
    fontSize=9.5,
    leading=13,
    textColor=colors.HexColor("#111827"),
    spaceAfter=5,
)
small = ParagraphStyle(
    "SmallCustom",
    parent=styles["BodyText"],
    fontName="Helvetica",
    fontSize=8.5,
    leading=11,
    textColor=colors.HexColor("#374151"),
)
mono = ParagraphStyle(
    "MonoCustom",
    parent=styles["Code"],
    fontName="Courier",
    fontSize=8.5,
    leading=11,
    textColor=colors.HexColor("#111827"),
)


def p(text, style=body):
    return Paragraph(text, style)


story = []
story.append(p("NexCode User Manual", title))
story.append(p("Local-first AI developer desktop app for coding, chat, terminal, vision, browser, MCP, and automation workflows.", body))
story.append(Spacer(1, 4))

summary_table = Table(
    [
        ["What you have", "Portable Windows build, not a traditional installer."],
        ["Main app entry", r"D:\nexCode\nexcode\dist\win-unpacked\NexCode.exe"],
        ["Login/API", "API keys are saved locally with Electron safeStorage when available."],
        ["Local AI", "Ollama runs on your machine at http://localhost:11434."],
    ],
    colWidths=[42 * mm, 128 * mm],
)
summary_table.setStyle(
    TableStyle(
        [
            ("BACKGROUND", (0, 0), (-1, -1), colors.whitesmoke),
            ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#d1d5db")),
            ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#d1d5db")),
            ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("LEADING", (0, 0), (-1, -1), 11),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#111827")),
            ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f3f4f6")),
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ]
    )
)
story.append(summary_table)
story.append(Spacer(1, 8))

story.append(p("1. Run vs Install", h1))
story.append(p("Right now the build you have is a portable app. You can run it directly from the EXE. If you want a normal installer later, I can build that too.", body))
story.append(ListFlowable(
    [
        ListItem(p("Portable run: open the EXE directly, no installation wizard.", body)),
        ListItem(p("Installer build: can be created later if you want Start Menu shortcuts and uninstall support.", body)),
        ListItem(p("If the app is updated, the portable build can simply be replaced with a newer EXE.", body)),
    ],
    bulletType="bullet",
    leftIndent=14,
))

story.append(p("2. First Launch", h1))
story.append(ListFlowable(
    [
        ListItem(p("Open the app from the EXE.", body)),
        ListItem(p("If Windows asks for permission, allow it because NexCode uses local files, terminal, and browser tools.", body)),
        ListItem(p("Choose a starting mode from the welcome screen: Cloud AI, Local AI, or Both.", body)),
        ListItem(p("Open a folder for code work, or start a new chat if you want to test the UI first.", body)),
    ],
    bulletType="bullet",
    leftIndent=14,
))

story.append(p("3. API Keys", h1))
story.append(p("Open Settings -> API Keys. You will see fields for OpenAI, Anthropic, Google Gemini, and Groq.", body))
story.append(ListFlowable(
    [
        ListItem(p("Paste the key into the matching field.", body)),
        ListItem(p("Click Test to verify the key works.", body)),
        ListItem(p("Click Save if you want to persist it.", body)),
        ListItem(p("Use Get Key to open the official provider page.", body)),
    ],
    bulletType="bullet",
    leftIndent=14,
))
story.append(p("Important: keys are stored locally, not in the cloud. That is good for privacy, but you still should protect your machine.", small))

story.append(p("4. Local Ollama Setup", h1))
story.append(p("Ollama is the local/offline model path. The app expects Ollama to be reachable at http://localhost:11434.", body))
story.append(ListFlowable(
    [
        ListItem(p("Install Ollama on your Windows machine.", body)),
        ListItem(p("Start Ollama once so the service is available.", body)),
        ListItem(p("Open NexCode -> Ollama Manager and refresh models.", body)),
        ListItem(p("Download a coding model like qwen2.5-coder:7b or deepseek-coder-v2:lite.", body)),
        ListItem(p("For local chat, llama3.2:3b is lighter.", body)),
        ListItem(p("For local vision, llava:7b is the recommended option.", body)),
    ],
    bulletType="bullet",
    leftIndent=14,
))
story.append(p("Once a model is downloaded, you can load it from the manager and use it for chat or coding workflows.", body))

story.append(p("5. Daily Workflow", h1))
story.append(ListFlowable(
    [
        ListItem(p("Editor: browse files, edit code, compare diffs, and save changes.", body)),
        ListItem(p("Chat: ask for help, code generation, explanations, or debugging.", body)),
        ListItem(p("Terminal: run shell commands inside the app.", body)),
        ListItem(p("Git: inspect branches, commit, diff, merge, stash, and worktrees.", body)),
        ListItem(p("Vision: capture or inspect images/screenshots for multimodal workflows.", body)),
        ListItem(p("Browser and Computer Use: automate browser actions and OS-level actions with caution.", body)),
    ],
    bulletType="bullet",
    leftIndent=14,
))

story.append(p("6. Pros", h1))
story.append(ListFlowable(
    [
        ListItem(p("Local-first design gives you privacy and offline capability.", body)),
        ListItem(p("Multiple providers are supported, so you are not locked into one model vendor.", body)),
        ListItem(p("Built-in terminal, git, browser, vision, and automation make it a broad developer hub.", body)),
        ListItem(p("API keys are handled locally with encryption support when available.", body)),
        ListItem(p("Ollama support gives you a true local model path.", body)),
    ],
    bulletType="bullet",
    leftIndent=14,
))

story.append(p("7. Cons / Tradeoffs", h1))
story.append(ListFlowable(
    [
        ListItem(p("The app is heavy because it bundles many tools and native modules.", body)),
        ListItem(p("Large installs and native binaries can create packaging complexity.", body)),
        ListItem(p("Some features depend on external services like Ollama, OpenAI, Anthropic, Gemini, or GitHub.", body)),
        ListItem(p("Powerful automation means more responsibility: browser and computer control should be used carefully.", body)),
        ListItem(p("Local models may be slower or need more RAM/VRAM than cloud models.", body)),
    ],
    bulletType="bullet",
    leftIndent=14,
))

story.append(PageBreak())
story.append(p("8. Troubleshooting", h1))
story.append(ListFlowable(
    [
        ListItem(p("If the app opens with no screen, make sure you are running the fresh executable from dist/win-unpacked.", body)),
        ListItem(p("If the UI still fails, restart the app after closing all NexCode processes from Task Manager.", body)),
        ListItem(p("If an API key test fails, recheck the key and provider account limits.", body)),
        ListItem(p("If Ollama does not show models, confirm Ollama is running on localhost:11434.", body)),
        ListItem(p("If a model is missing, download it in Ollama Manager first.", body)),
        ListItem(p("If the app says a native module is missing, rebuild native deps and use the new packaged output.", body)),
    ],
    bulletType="bullet",
    leftIndent=14,
))

story.append(p("9. Quick Recommendation", h1))
story.append(p("Use cloud models when you want convenience and stronger hosted capability. Use Ollama when you want privacy, offline work, or lower recurring cost. For most users, the best setup is Both.", body))

story.append(Spacer(1, 8))
story.append(p("Build note: This manual is based on the current NexCode codebase and the Windows portable build.", small))


def add_page_number(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#6b7280"))
    canvas.drawRightString(195 * mm, 12 * mm, f"Page {doc.page}")
    canvas.restoreState()


doc = SimpleDocTemplate(
    str(PDF_PATH),
    pagesize=A4,
    leftMargin=18 * mm,
    rightMargin=18 * mm,
    topMargin=16 * mm,
    bottomMargin=16 * mm,
    title="NexCode User Manual",
    author="Codex",
)
doc.build(story, onFirstPage=add_page_number, onLaterPages=add_page_number)
print(PDF_PATH)
