from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_ALIGN_VERTICAL, WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from docx.oxml.ns import nsdecls

def create_optimized_report():
    doc = Document()
    
    # 设置默认字体
    style = doc.styles['Normal']
    style.font.name = '宋体'
    style.font.size = Pt(12)
    style.element.rPr.rFonts.set(qn('w:eastAsia'), '宋体')
    
    # 设置页面大小为A4
    section = doc.sections[0]
    section.page_width = Cm(21)
    section.page_height = Cm(29.7)
    section.left_margin = Cm(2.5)
    section.right_margin = Cm(2.5)
    section.top_margin = Cm(2.5)
    section.bottom_margin = Cm(2.5)
    
    # ========== 封面页 ==========
    # 添加封面边框
    cover_paragraph = doc.add_paragraph()
    cover_paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    
    # 标题区域
    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title.space_before = Cm(8)  # 标题前间距
    title.space_after = Cm(2)
    
    title_run = title.add_run("人工智能创意大赛项目报告")
    title_run.font.size = Pt(24)
    title_run.font.bold = True
    title_run.font.name = "黑体"
    title_run.element.rPr.rFonts.set(qn('w:eastAsia'), '黑体')
    title_run.font.color.rgb = RGBColor(0, 51, 102)  # 深蓝色
    
    # 装饰线
    line = doc.add_paragraph()
    line.alignment = WD_ALIGN_PARAGRAPH.CENTER
    line_run = line.add_run("═" * 30)
    line_run.font.size = Pt(14)
    line_run.font.color.rgb = RGBColor(0, 102, 204)
    
    # 空行
    doc.add_paragraph()
    doc.add_paragraph()
    
    # 项目名称
    project_name = doc.add_paragraph()
    project_name.alignment = WD_ALIGN_PARAGRAPH.LEFT
    project_name.space_before = Cm(1)
    
    project_name_label = project_name.add_run("项目名称：")
    project_name_label.font.size = Pt(14)
    project_name_label.font.name = "黑体"
    project_name_label.element.rPr.rFonts.set(qn('w:eastAsia'), '黑体')
    
    project_name_value = project_name.add_run("智能校园食堂菜品推荐系统")
    project_name_value.font.size = Pt(14)
    project_name_value.font.name = "宋体"
    project_name_value.element.rPr.rFonts.set(qn('w:eastAsia'), '宋体')
    
    # 空行
    doc.add_paragraph()
    doc.add_paragraph()
    
    # 团队名称
    team_name = doc.add_paragraph()
    team_name.alignment = WD_ALIGN_PARAGRAPH.LEFT
    
    team_name_label = team_name.add_run("团队名称：")
    team_name_label.font.size = Pt(14)
    team_name_label.font.name = "黑体"
    team_name_label.element.rPr.rFonts.set(qn('w:eastAsia'), '黑体')
    
    team_name_value = team_name.add_run("AI美食探索者")
    team_name_value.font.size = Pt(14)
    team_name_value.font.name = "宋体"
    team_name_value.element.rPr.rFonts.set(qn('w:eastAsia'), '宋体')
    
    # 空行
    doc.add_paragraph()
    doc.add_paragraph()
    
    # 成员信息标题
    member_title = doc.add_paragraph()
    member_title.alignment = WD_ALIGN_PARAGRAPH.LEFT
    member_title.space_before = Cm(1)
    
    member_title_run = member_title.add_run("成员信息：")
    member_title_run.font.size = Pt(14)
    member_title_run.font.name = "黑体"
    member_title_run.element.rPr.rFonts.set(qn('w:eastAsia'), '黑体')
    
    # 成员表格
    table = doc.add_table(rows=5, cols=4)
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.LEFT
    
    # 设置表格边框
    tbl = table._tbl
    tblPr = tbl.tblPr
    tblBorders = OxmlElement('w:tblBorders')
    for border_name in ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']:
        border = OxmlElement(f'w:{border_name}')
        border.set(qn('w:val'), 'single')
        border.set(qn('w:sz'), '4')
        border.set(qn('w:color'), '000000')
        tblBorders.append(border)
    tblPr.append(tblBorders)
    
    # 表头
    hdr_cells = table.rows[0].cells
    hdr_cells[0].text = "序号"
    hdr_cells[1].text = "学号"
    hdr_cells[2].text = "姓名"
    hdr_cells[3].text = "职责"
    
    # 设置表头背景色
    for cell in hdr_cells:
        tcPr = cell._tc.get_or_add_tcPr()
        shading = OxmlElement('w:shd')
        shading.set(qn('w:fill'), 'E6F3FF')
        tcPr.append(shading)
    
    # 数据
    member_data = [
        ["1", "-", "-", "项目负责人、算法设计"],
        ["2", "-", "-", "前端开发、UI设计"],
        ["3", "-", "-", "后端开发、API设计"],
        ["4", "-", "-", "数据处理、模型训练"]
    ]
    
    for i, data in enumerate(member_data):
        table.rows[i+1].cells[0].text = data[0]
        table.rows[i+1].cells[1].text = data[1]
        table.rows[i+1].cells[2].text = data[2]
        table.rows[i+1].cells[3].text = data[3]
    
    # 设置表格列宽
    table.columns[0].width = Cm(1.5)
    table.columns[1].width = Cm(3)
    table.columns[2].width = Cm(2)
    table.columns[3].width = Cm(8)
    
    # 设置表格字体和对齐
    for row in table.rows:
        for cell in row.cells:
            cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
            paragraphs = cell.paragraphs
            for paragraph in paragraphs:
                paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
                for run in paragraph.runs:
                    run.font.size = Pt(11)
                    run.font.name = "宋体"
                    run.element.rPr.rFonts.set(qn('w:eastAsia'), '宋体')
    
    # 空行
    for _ in range(6):
        doc.add_paragraph()
    
    # 完成日期
    date_paragraph = doc.add_paragraph()
    date_paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    date_paragraph.space_before = Cm(2)
    
    date_label = date_paragraph.add_run("完成日期：")
    date_label.font.size = Pt(14)
    date_label.font.name = "黑体"
    date_label.element.rPr.rFonts.set(qn('w:eastAsia'), '黑体')
    
    date_value = date_paragraph.add_run("2026年4月28日")
    date_value.font.size = Pt(14)
    date_value.font.name = "宋体"
    date_value.element.rPr.rFonts.set(qn('w:eastAsia'), '宋体')
    
    # ========== 目录页（新页面） ==========
    toc_section = doc.add_section(WD_SECTION.NEW_PAGE)
    
    # 目录标题
    toc_title = doc.add_paragraph()
    toc_title.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    toc_title.space_before = Cm(3)
    
    toc_title_run = toc_title.add_run("参考目录")
    toc_title_run.font.size = Pt(16)
    toc_title_run.font.bold = True
    toc_title_run.font.name = "黑体"
    toc_title_run.element.rPr.rFonts.set(qn('w:eastAsia'), '黑体')
    toc_title_run.font.color.rgb = RGBColor(0, 51, 102)
    
    doc.add_paragraph()
    
    # 目录内容
    toc_items = [
        ("一、项目概述", "1"),
        ("二、项目背景与问题分析", "2"),
        ("三、项目创意设计与人工智能应用", "3"),
        ("四、系统总体设计与实现思路", "4"),
        ("五、项目创新点", "5"),
        ("六、可行性分析", "6"),
        ("七、应用价值与预期效果", "7"),
        ("八、团队分工与实施计划", "8"),
        ("九、总结与未来展望", "9"),
        ("十、参考文献", "10")
    ]
    
    for item, page in toc_items:
        toc_item = doc.add_paragraph()
        toc_item.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        
        item_run = toc_item.add_run(item)
        item_run.font.size = Pt(12)
        item_run.font.name = "宋体"
        item_run.element.rPr.rFonts.set(qn('w:eastAsia'), '宋体')
        
        # 添加点线
        dots_run = toc_item.add_run("  " + "·" * 30 + "  ")
        dots_run.font.size = Pt(10)
        
        page_run = toc_item.add_run(page)
        page_run.font.size = Pt(12)
        page_run.font.name = "宋体"
        page_run.element.rPr.rFonts.set(qn('w:eastAsia'), '宋体')
    
    # ========== 正文章节 ==========
    chapters = [
        "项目概述",
        "项目背景与问题分析",
        "项目创意设计与人工智能应用",
        "系统总体设计与实现思路",
        "项目创新点",
        "可行性分析",
        "应用价值与预期效果",
        "团队分工与实施计划",
        "总结与未来展望",
        "参考文献"
    ]
    
    for idx, chapter_title in enumerate(chapters, 1):
        doc.add_section(WD_SECTION.NEW_PAGE)
        
        # 章节标题
        chapter = doc.add_paragraph()
        chapter.alignment = WD_ALIGN_PARAGRAPH.LEFT
        chapter.space_before = Cm(1)
        chapter.space_after = Cm(1)
        
        chapter_run = chapter.add_run(f"{idx}、{chapter_title}")
        chapter_run.font.size = Pt(18)
        chapter_run.font.bold = True
        chapter_run.font.name = "黑体"
        chapter_run.element.rPr.rFonts.set(qn('w:eastAsia'), '黑体')
        chapter_run.font.color.rgb = RGBColor(0, 51, 102)
        
        # 分隔线
        separator = doc.add_paragraph()
        separator_run = separator.add_run("─" * 45)
        separator_run.font.size = Pt(12)
        separator_run.font.color.rgb = RGBColor(153, 153, 153)
        
        # 章节内容占位（实际内容需要根据markdown填充）
        content = doc.add_paragraph()
        content.first_line_indent = Cm(0.74)
        content.space_after = Cm(0.5)
        
        if idx == 1:
            content_run = content.add_run("本项目旨在开发一套智能校园食堂菜品推荐系统，利用人工智能技术为在校师生提供个性化的就餐推荐服务。系统通过分析用户的口味偏好、营养需求、消费预算等多维度信息，结合机器学习算法，为用户推荐最适合的食堂菜品。")
        elif idx == 2:
            content_run = content.add_run("随着高校规模的扩大，食堂菜品种类日益丰富，但学生面临选择困难、信息不对称、个性化需求未满足等问题。本系统旨在解决这些痛点，提供智能推荐服务。")
        elif idx == 3:
            content_run = content.add_run("系统采用双模型架构：后端使用随机森林回归器进行精准评分预测，前端使用决策树模型支持离线推荐。通过21维特征工程，整合口味、营养、价格、宗教、过敏源等信息，实现智能匹配。")
        elif idx == 4:
            content_run = content.add_run("系统采用前后端分离架构，包含用户认证、偏好收集、智能推荐、反馈系统等核心模块。匹配度计算公式为：口味匹配(3分) + 营养匹配(3分) + 评分匹配(2.5分)，总上限8.5分。")
        elif idx == 5:
            content_run = content.add_run("项目创新点包括：双模型推荐架构保证精度与离线可用性，盲盒推荐机制增加趣味性，实时反馈闭环持续学习用户偏好，透明推荐解释增强用户信任感。")
        elif idx == 6:
            content_run = content.add_run("技术可行性高，使用成熟的Scikit-learn框架、Bootstrap 5前端框架和Node.js后端技术。经济可行性良好，可低成本部署在校园服务器或云平台。")
        elif idx == 7:
            content_run = content.add_run("系统对学生价值包括节省时间、营养健康、发现新品、个性化服务；对食堂价值包括优化运营、数据驱动改进、提升满意度、资源优化。预期推荐准确率≥70%，用户满意度≥85%。")
        elif idx == 8:
            content_run = content.add_run("团队分工明确，成员分别负责算法设计、前端开发、后端开发和数据处理。实施计划分为五个阶段，共计10周完成。")
        elif idx == 9:
            content_run = content.add_run("本项目成功实现了智能校园食堂菜品推荐系统，未来将扩展社交推荐、套餐组合推荐等功能，引入深度学习模型提升精度。")
        elif idx == 10:
            content_run = content.add_run("参考文献包括周志华《机器学习》、李航《统计学习方法》等经典教材，以及Scikit-learn、Bootstrap、Express.js等技术文档。")
        
        content_run.font.size = Pt(12)
        content_run.font.name = "宋体"
        content_run.element.rPr.rFonts.set(qn('w:eastAsia'), '宋体')
    
    # 保存文档
    doc.save("项目报告_优化版.docx")
    print("文档已保存为: 项目报告_优化版.docx")

if __name__ == "__main__":
    create_optimized_report()