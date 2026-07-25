param(
  [string]$PackageDir = (Join-Path $PSScriptRoot 'Pacote_Pericial_Contabil_Multiprofissional_V03')
)

$ErrorActionPreference = 'Stop'
$openXml = Get-ChildItem -Path 'C:\Program Files\Microsoft Office\root' -Filter 'DocumentFormat.OpenXml.dll' -Recurse -ErrorAction Stop |
  Select-Object -First 1 -ExpandProperty FullName
if (-not $openXml) { throw 'DocumentFormat.OpenXml.dll não localizado.' }
$windowsBase = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\WPF\WindowsBase.dll'
[void][System.Reflection.Assembly]::LoadFrom($openXml)

$source = @'
using System;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;

public static class PericialDocxBuilder
{
    private const string Navy = "15385C";
    private const string Gold = "C7A45A";
    private const string TextColor = "172338";
    private const string Light = "F2F5F7";

    public static void Create(string htmlPath, string docxPath, string headerText)
    {
        string html = File.ReadAllText(htmlPath);
        Match bodyMatch = Regex.Match(html, @"<body[^>]*>([\s\S]*?)</body>", RegexOptions.IgnoreCase);
        if (!bodyMatch.Success) throw new InvalidOperationException("Elemento body não encontrado.");
        string bodyHtml = Regex.Replace(bodyMatch.Groups[1].Value, @"<br\s*>", "<br/>", RegexOptions.IgnoreCase);
        XDocument xdoc = XDocument.Parse("<root>" + bodyHtml + "</root>", LoadOptions.PreserveWhitespace);

        if (File.Exists(docxPath)) File.Delete(docxPath);
        using (WordprocessingDocument package = WordprocessingDocument.Create(docxPath, WordprocessingDocumentType.Document))
        {
            MainDocumentPart main = package.AddMainDocumentPart();
            main.Document = new Document(new Body());
            AddStyles(main);
            Body body = main.Document.Body;
            bool firstSection = true;
            foreach (XElement block in xdoc.Root.Elements())
            {
                if (Local(block) == "section")
                {
                    string cls = Attr(block, "class");
                    if (!firstSection && cls.Contains("page"))
                        body.Append(new Paragraph(new Run(new Break() { Type = BreakValues.Page })));
                    firstSection = false;
                    foreach (XElement child in block.Elements())
                        AddBlock(body, child, false);
                }
                else AddBlock(body, block, false);
            }

            HeaderPart hp = main.AddNewPart<HeaderPart>();
            hp.Header = new Header(MakeHeaderParagraph(headerText));
            FooterPart fp = main.AddNewPart<FooterPart>();
            fp.Footer = new Footer(MakeFooterParagraph());
            SectionProperties sect = new SectionProperties(
                new HeaderReference() { Type = HeaderFooterValues.Default, Id = main.GetIdOfPart(hp) },
                new FooterReference() { Type = HeaderFooterValues.Default, Id = main.GetIdOfPart(fp) },
                new PageSize() { Width = 11906U, Height = 16838U },
                new PageMargin() { Top = 1134, Right = 964U, Bottom = 1020, Left = 964U, Header = 454U, Footer = 454U, Gutter = 0U }
            );
            body.Append(sect);
            main.Document.Save();
        }
    }

    private static void AddStyles(MainDocumentPart main)
    {
        StyleDefinitionsPart sp = main.AddNewPart<StyleDefinitionsPart>();
        Styles styles = new Styles();
        styles.Append(MakeStyle("Normal", "Normal", "21", false, TextColor, false, "120"));
        styles.Append(MakeStyle("Title", "Título", "46", true, Navy, true, "180"));
        styles.Append(MakeStyle("Heading1", "Título 1", "30", true, Navy, true, "160"));
        styles.Append(MakeStyle("Heading2", "Título 2", "23", true, Navy, true, "100"));
        styles.Append(MakeStyle("Small", "Texto pequeno", "17", false, "58697A", false, "80"));
        styles.Append(MakeStyle("Code", "Código", "17", false, "1E456A", false, "60", "Consolas"));
        sp.Styles = styles;
    }

    private static Style MakeStyle(string id, string name, string size, bool bold, string color, bool keep, string after, string font = "Aptos")
    {
        Style s = new Style() { Type = StyleValues.Paragraph, StyleId = id };
        s.Append(new StyleName() { Val = name });
        StyleParagraphProperties pp = new StyleParagraphProperties();
        if (keep) pp.Append(new KeepNext());
        pp.Append(new SpacingBetweenLines() { After = after, Line = "276", LineRule = LineSpacingRuleValues.Auto });
        s.Append(pp);
        StyleRunProperties rp = new StyleRunProperties();
        rp.Append(new RunFonts() { Ascii = font, HighAnsi = font, EastAsia = font });
        if (bold) rp.Append(new Bold());
        rp.Append(new Color() { Val = color });
        rp.Append(new FontSize() { Val = size });
        rp.Append(new FontSizeComplexScript() { Val = size });
        s.Append(rp);
        return s;
    }

    private static void AddBlock(Body body, XElement e, bool callout)
    {
        string name = Local(e);
        if (name == "div")
        {
            bool nextCallout = callout || Attr(e, "class").Contains("callout") || Attr(e, "class").Contains("cover-box");
            foreach (XElement child in e.Elements()) AddBlock(body, child, nextCallout);
            return;
        }
        if (name == "h1") { body.Append(MakeParagraph(e, "Title", false)); return; }
        if (name == "h2") { body.Append(MakeParagraph(e, "Heading1", false)); return; }
        if (name == "h3") { body.Append(MakeParagraph(e, "Heading2", false)); return; }
        if (name == "p") { body.Append(MakeParagraph(e, Attr(e, "class").Contains("small") ? "Small" : "Normal", callout)); return; }
        if (name == "pre") { body.Append(MakeCodeParagraph(e.Value)); return; }
        if (name == "table") { body.Append(MakeTable(e)); return; }
        if (name == "ul" || name == "ol")
        {
            int index = 1;
            foreach (XElement li in e.Elements().Where(x => Local(x) == "li"))
            {
                Paragraph p = MakeParagraph(li, "Normal", callout);
                p.InsertAt(new Run(new Text(name == "ul" ? "• " : (index++).ToString() + ". ") { Space = SpaceProcessingModeValues.Preserve }), 1);
                body.Append(p);
            }
            return;
        }
        foreach (XElement child in e.Elements()) AddBlock(body, child, callout);
    }

    private static Paragraph MakeParagraph(XElement e, string style, bool callout)
    {
        ParagraphProperties pp = new ParagraphProperties(
            new ParagraphStyleId() { Val = style },
            new KeepLines()
        );
        if (callout)
        {
            pp.Append(new ParagraphBorders(new LeftBorder() { Val = BorderValues.Single, Color = Gold, Size = 16U, Space = 8U }));
            pp.Append(new Shading() { Val = ShadingPatternValues.Clear, Fill = "F4F6F8" });
            pp.Append(new Indentation() { Left = "180", Right = "120" });
        }
        if (style == "Normal") pp.Append(new Justification() { Val = JustificationValues.Both });
        Paragraph p = new Paragraph(pp);
        AddInline(p, e.Nodes(), false, false);
        return p;
    }

    private static Paragraph MakeCodeParagraph(string value)
    {
        ParagraphProperties pp = new ParagraphProperties(
            new ParagraphStyleId() { Val = "Code" },
            new KeepLines(),
            new ParagraphBorders(new LeftBorder() { Val = BorderValues.Single, Color = Gold, Size = 16U, Space = 8U }),
            new Shading() { Val = ShadingPatternValues.Clear, Fill = Light },
            new Indentation() { Left = "180", Right = "120" }
        );
        Paragraph p = new Paragraph(pp);
        string[] lines = value.Replace("\r", "").Split('\n');
        for (int i = 0; i < lines.Length; i++)
        {
            p.Append(MakeRun(lines[i], false, true));
            if (i < lines.Length - 1) p.Append(new Run(new Break()));
        }
        return p;
    }

    private static void AddInline(OpenXmlCompositeElement parent, System.Collections.Generic.IEnumerable<XNode> nodes, bool bold, bool code)
    {
        foreach (XNode node in nodes)
        {
            XText text = node as XText;
            if (text != null)
            {
                string clean = Regex.Replace(text.Value, @"\s+", " ");
                if (clean.Length > 0) parent.Append(MakeRun(clean, bold, code));
                continue;
            }
            XElement el = node as XElement;
            if (el == null) continue;
            string n = Local(el);
            if (n == "br") { parent.Append(new Run(new Break())); continue; }
            AddInline(parent, el.Nodes(), bold || n == "strong" || n == "b", code || n == "code");
        }
    }

    private static Run MakeRun(string text, bool bold, bool code)
    {
        RunProperties rp = new RunProperties();
        rp.Append(new RunFonts() { Ascii = code ? "Consolas" : "Aptos", HighAnsi = code ? "Consolas" : "Aptos" });
        if (bold) rp.Append(new Bold());
        rp.Append(new Color() { Val = TextColor });
        rp.Append(new FontSize() { Val = code ? "17" : "21" });
        return new Run(rp, new Text(text) { Space = SpaceProcessingModeValues.Preserve });
    }

    private static Table MakeTable(XElement e)
    {
        Table table = new Table();
        TableProperties props = new TableProperties(
            new TableWidth() { Type = TableWidthUnitValues.Pct, Width = "5000" },
            new TableBorders(
                new TopBorder() { Val = BorderValues.Single, Color = "B9C3CF", Size = 4U },
                new LeftBorder() { Val = BorderValues.Single, Color = "B9C3CF", Size = 4U },
                new BottomBorder() { Val = BorderValues.Single, Color = "B9C3CF", Size = 4U },
                new RightBorder() { Val = BorderValues.Single, Color = "B9C3CF", Size = 4U },
                new InsideHorizontalBorder() { Val = BorderValues.Single, Color = "D0D7DE", Size = 4U },
                new InsideVerticalBorder() { Val = BorderValues.Single, Color = "D0D7DE", Size = 4U }
            ),
            new TableCellMarginDefault(
                new TopMargin() { Width = "80", Type = TableWidthUnitValues.Dxa },
                new TableCellLeftMargin() { Width = 100, Type = TableWidthValues.Dxa },
                new BottomMargin() { Width = "80", Type = TableWidthUnitValues.Dxa },
                new TableCellRightMargin() { Width = 100, Type = TableWidthValues.Dxa }
            )
        );
        table.Append(props);
        table.Append(new TableGrid());
        int rowIndex = 0;
        foreach (XElement rowEl in e.Elements().Where(x => Local(x) == "tr"))
        {
            TableRow row = new TableRow(new TableRowProperties(new CantSplit()));
            bool header = rowEl.Elements().Any(x => Local(x) == "th");
            if (rowIndex == 0 && header) row.GetFirstChild<TableRowProperties>().Append(new TableHeader());
            foreach (XElement cellEl in rowEl.Elements().Where(x => Local(x) == "td" || Local(x) == "th"))
            {
                TableCellProperties cp = new TableCellProperties();
                string colspan = Attr(cellEl, "colspan");
                int span;
                if (Int32.TryParse(colspan, out span) && span > 1) cp.Append(new GridSpan() { Val = span });
                if (header) cp.Append(new Shading() { Val = ShadingPatternValues.Clear, Fill = Navy });
                cp.Append(new TableCellVerticalAlignment() { Val = TableVerticalAlignmentValues.Center });
                ParagraphProperties pp = new ParagraphProperties(
                    new SpacingBetweenLines() { After = "40", Line = "250", LineRule = LineSpacingRuleValues.Auto }
                );
                Paragraph p = new Paragraph(pp);
                AddInline(p, cellEl.Nodes(), header, false);
                if (header)
                {
                    foreach (Run r in p.Elements<Run>())
                    {
                        RunProperties rp = r.GetFirstChild<RunProperties>();
                        if (rp != null)
                        {
                            Color c = rp.GetFirstChild<Color>();
                            if (c != null) c.Val = "FFFFFF"; else rp.Append(new Color() { Val = "FFFFFF" });
                        }
                    }
                }
                row.Append(new TableCell(cp, p));
            }
            table.Append(row);
            rowIndex++;
        }
        return table;
    }

    private static Paragraph MakeHeaderParagraph(string text)
    {
        ParagraphProperties pp = new ParagraphProperties(
            new ParagraphBorders(new BottomBorder() { Val = BorderValues.Single, Color = Gold, Size = 8U, Space = 4U }),
            new SpacingBetweenLines() { After = "0" },
            new Justification() { Val = JustificationValues.Left }
        );
        RunProperties rp = new RunProperties(new RunFonts() { Ascii = "Aptos", HighAnsi = "Aptos" }, new Color() { Val = "5C6D7E" }, new FontSize() { Val = "16" });
        return new Paragraph(pp, new Run(rp, new Text(text)));
    }

    private static Paragraph MakeFooterParagraph()
    {
        Paragraph p = new Paragraph(new ParagraphProperties(new Justification() { Val = JustificationValues.Right }));
        p.Append(new Run(new RunProperties(new Color() { Val = "5C6D7E" }, new FontSize() { Val = "16" }), new Text("MINUTA NÃO ASSINADA  •  Página ") { Space = SpaceProcessingModeValues.Preserve }));
        p.Append(new Run(new FieldChar() { FieldCharType = FieldCharValues.Begin }));
        p.Append(new Run(new FieldCode(" PAGE ")));
        p.Append(new Run(new FieldChar() { FieldCharType = FieldCharValues.Separate }));
        p.Append(new Run(new Text("1")));
        p.Append(new Run(new FieldChar() { FieldCharType = FieldCharValues.End }));
        return p;
    }

    private static string Local(XElement e) { return e.Name.LocalName.ToLowerInvariant(); }
    private static string Attr(XElement e, string name)
    {
        XAttribute a = e.Attribute(name);
        return a == null ? String.Empty : a.Value;
    }
}
'@

Add-Type -TypeDefinition $source -ReferencedAssemblies @($openXml, 'System.Xml.dll', 'System.Xml.Linq.dll', 'System.Core.dll', $windowsBase)
$package = (Resolve-Path -LiteralPath $PackageDir).Path
[PericialDocxBuilder]::Create(
  (Join-Path $package 'modelo_v03_source.html'),
  (Join-Path $package '01_Modelo_Laudo_Parecer_Pericial_Contabil_Multiprofissional_V03.docx'),
  'MODELO PROFISSIONAL VITOR  •  V02'
)
[PericialDocxBuilder]::Create(
  (Join-Path $package 'manual_v03_source.html'),
  (Join-Path $package '02_Manual_Integral_Implantacao_Gerador_Pericial_Multiprofissional_V03.docx'),
  'MOTOR PERICIAL CONTÁBIL VITOR  •  MANUAL V02'
)
Get-Item -LiteralPath (Join-Path $package '01_Modelo_Laudo_Parecer_Pericial_Contabil_Multiprofissional_V03.docx'),
  (Join-Path $package '02_Manual_Integral_Implantacao_Gerador_Pericial_Multiprofissional_V03.docx') |
  Select-Object FullName, Length, LastWriteTime
