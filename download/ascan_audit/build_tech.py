# -*- coding: utf-8 -*-
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Image, PageBreak,
                                Table, TableStyle, KeepTogether)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
F="/usr/share/fonts/truetype/dejavu"
pdfmetrics.registerFont(TTFont("DJ",f"{F}/DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("DJ-B",f"{F}/DejaVuSans-Bold.ttf"))
pdfmetrics.registerFont(TTFont("DJ-O",f"{F}/DejaVuSans-Oblique.ttf"))
pdfmetrics.registerFontFamily("DJ",normal="DJ",bold="DJ-B",italic="DJ-O",boldItalic="DJ-B")
IMG="/sessions/focused-amazing-ride/mnt/outputs/ascan_audit/img"
OUT="/sessions/focused-amazing-ride/mnt/outputs/ascan_audit/_tech_addendum.pdf"
BLUE=colors.HexColor("#1F4E79");GREY=colors.HexColor("#595959");LGREY=colors.HexColor("#D9D9D9");ACC=colors.HexColor("#C00000")
def S(n,**k):
    b=dict(fontName="DJ",fontSize=9.5,leading=13,textColor=colors.black);b.update(k);return ParagraphStyle(n,**b)
st_title=S("t",fontName="DJ-B",fontSize=20,leading=24,textColor=BLUE)
st_sub=S("sub",fontSize=11,leading=15,textColor=GREY)
st_h1=S("h1",fontName="DJ-B",fontSize=15,leading=19,textColor=BLUE,spaceBefore=4,spaceAfter=6)
st_cap=S("cap",fontName="DJ-B",fontSize=10.5,leading=14,textColor=BLUE,spaceBefore=2,spaceAfter=2)
st_body=S("b",fontSize=9.5,leading=13.5)
st_small=S("sm",fontSize=8.5,leading=11.5,textColor=GREY)
st_note=S("n",fontSize=9,leading=12.5,textColor=GREY,fontName="DJ-O")
st_cell=S("c",fontSize=8,leading=10)
st_cellb=S("cb",fontSize=8,leading=10,fontName="DJ-B",textColor=colors.white)
LM=RM=15*mm;PAGE_W,PAGE_H=A4;CW=PAGE_W-LM-RM
def shot(f): 
    w=CW;h=w*639/1536.0;im=Image(os.path.join(IMG,f),width=w,height=h);im.hAlign="CENTER";return im
def screen(num,f,title,desc):
    return KeepTogether([Paragraph(f'{num}. {title}',st_cap),Spacer(1,2),shot(f),Spacer(1,3),Paragraph(desc,st_body),Spacer(1,10)])
story=[]
story.append(Spacer(1,14))
story.append(Paragraph("F. Роль техника-установщика (ДемоТехникУстановщик)", st_title))
story.append(Paragraph("Дополнение к аудиту демо-базы «Аскан» · сравнение с менеджерской ролью", st_sub))
story.append(Spacer(1,12))
story.append(Paragraph("Доступ и первичный вход", st_h1))
story.append(Paragraph("Вход <b>ДемоТехникУстановщик / jU5gujas</b> при первом входе принудительно требует смены пароля "
"(«Для входа в программу смените пароль на новый»); закрытие диалога завершает сессию. Пароль общей демо-учётки "
"сменил владелец доступа. После входа роль показывает <b>сильно урезанный интерфейс</b>: в левом меню только "
"«Главное» и «НСИ и администрирование», а рабочий процесс собран в едином экране-лаунчере.", st_body))
story.append(Spacer(1,4))
story.append(Paragraph("Итог по искомым вкладкам «Фотофиксация» и «SIM»: в акте техника это <b>не отдельные вкладки</b>. "
"Фотофиксация реализована как вложения <b>«Файлы»</b> (фото прикрепляются к акту, доступны после записи). "
"SIM — это скрытый контекстный подраздел «SIM-карты» в акте <b>плюс</b> отдельный отчёт <b>«Остатки SIM-карт»</b> "
"в рабочем месте техника.", st_note))
story.append(Spacer(1,8))

story.append(screen("F1","ascan_T0_tech_workplace.jpg","Рабочее место техника-установщика",
"Единый экран-лаунчер роли. <b>Документы:</b> Заказы-наряды. <b>Отчёты:</b> Расписание работ исполнителя, "
"<b>SIM - карты</b> (Остатки SIM-карт), Ведомость по сдельному заработку исполнителей, Товары и оборудование БУ на складах. "
"Всё, что нужно технику в поле, — на одном экране; полноценные разделы бэк-офиса (продажи, биллинг, сервис) технику недоступны."))
story.append(screen("F2","ascan_T1_tech_workorders.jpg","Заказы-наряды техника",
"Упрощённый список нарядов: Дата, Заказ-наряд, колонка <b>«Акт»</b> с зелёной кнопкой создания акта, Адрес, Клиент, "
"Объект мониторинга. Фильтр по дате и флажок <b>«Не показывать закрытые»</b> — техник видит только свои открытые выезды. "
"Кнопка «+» в колонке «Акт» сразу создаёт акт ТО по наряду."))
story.append(screen("F3","ascan_T2_tech_act_top.jpg","Акт ТО техника — шапка (другая форма!)",
"Форма акта у техника <b>отличается от менеджерской</b>: не вкладки, а единый прокручиваемый лист со сворачиваемыми "
"разделами. Появляются полевые элементы: <b>«Добавить подпись клиента»</b>, <b>«Подписант от клиента»</b>, "
"<b>«Несколько исполнителей»</b>, «Размещение». Печать даёт форму <b>«Заказ-наряд с подписями»</b> — подпись клиента "
"фиксируется на месте."))
story.append(screen("F4","ascan_T3_tech_act_equipment.jpg","Акт ТО техника — «Оборудование, услуги» (шире)",
"Табличная часть богаче менеджерской: помимо <b>установленного</b> (Номенклатура/Серия/Состояние установленного) "
"учитывается <b>снятое</b> оборудование (<b>Номенклатура снятая / Серия снятая / Состояние снятая</b>), плюс "
"Обеспечение, Гарантия, «Действие со…», Склад. Это ровно сценарий полевой <b>замены</b> прибора: снял старый — поставил новый, "
"с фиксацией серий обоих."))
story.append(screen("F5","ascan_T4_tech_act_additional.jpg","Акт ТО техника — «Дополнительно»",
"Служебный раздел: Ответственный (техник), Подразделение, Статья расходов/активов, Аналитика расходов. Набор разделов "
"акта совпадает с менеджером (Основное, Результат работ, Оборудование/услуги, Работы, Материалы, Дополнительно), "
"но подача — полевая (гармошка + подпись клиента + учёт снятого оборудования)."))

# SIM report (reconstructed schematic — spreadsheet field not capturable)
story.append(Paragraph("F6. Отчёт «Остатки SIM-карт»", st_cap))
story.append(Paragraph("Отдельный отчёт по SIM из рабочего места техника. Учитывает остатки SIM-карт с группировкой "
"<b>Склад → Сотрудник → Оборудование</b> и фильтром <b>«Тип размещения»</b> (на складе / у сотрудника / в оборудовании). "
"Подтверждает, что SIM — полноценно учитываемая сущность с движением по местам хранения; в демо-данных записей нет "
"(отчёт формируется пустым). Ниже — схема макета отчёта.", st_body))
story.append(Spacer(1,3))
sim=[[Paragraph("Склад / Сотрудник / Оборудование",st_cellb),Paragraph("Тип размещения",st_cellb),Paragraph("Остаток (SIM)",st_cellb)],
     [Paragraph("Склад УЦ",st_cell),Paragraph("На складе",st_cell),Paragraph("—",st_cell)],
     [Paragraph("   Сотрудник (техник)",st_cell),Paragraph("У сотрудника",st_cell),Paragraph("—",st_cell)],
     [Paragraph("      Оборудование (терминал)",st_cell),Paragraph("В оборудовании",st_cell),Paragraph("—",st_cell)]]
simt=Table(sim,colWidths=[95*mm,45*mm,40*mm])
simt.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),BLUE),("GRID",(0,0),(-1,-1),0.3,LGREY),
("ROWBACKGROUNDS",(0,1),(-1,-1),[colors.white,colors.HexColor("#F2F6FB")]),
("TOPPADDING",(0,0),(-1,-1),3),("BOTTOMPADDING",(0,0),(-1,-1),3),("VALIGN",(0,0),(-1,-1),"MIDDLE")]))
story.append(simt)
story.append(Paragraph("Схема (отчёт — «табличный документ» 1С, не поддаётся браузерному растровому захвату; в демо пуст).", st_small))
story.append(Spacer(1,10))

# Differences table
story.append(Paragraph("F7. Сводка отличий: менеджер против техника", st_h1))
diff=[["Аспект","Менеджер (ДемоПользователь)","Техник (ДемоТехникУстановщик)"],
["Левое меню","Все разделы (Продажи, Сервис, Абонплата, Казначейство, НСИ и т.д.)","Только «Главное» и «НСИ и администрирование»"],
["Точка входа","Рабочий стол с задачами и почтой","Экран-лаунчер «Рабочее место техника-установщика»"],
["Документы","Полный доступ (заявки, наряды, акты, биллинг)","Только «Заказы-наряды» (свои открытые)"],
["Форма акта ТО","Вкладки (7 шт.)","Единый лист со сворачиваемыми разделами"],
["Подпись клиента","Нет","«Добавить подпись клиента» + печать «с подписями»"],
["Оборудование в акте","Установленное","Установленное + снятое (замена)"],
["Фотофиксация","—","Вложения «Файлы» к акту"],
["SIM","Как измерение в отчётах оборудования","Отчёт «Остатки SIM-карт» (Склад/Сотрудник/Оборудование)"],
["Отчёты","Полный набор по всем подсистемам","4 отчёта: расписание, SIM, сдельный заработок, БУ-оборудование"]]
rows=[[Paragraph(c,st_cellb if i==0 else (S('cx',fontName='DJ-B',fontSize=8,leading=10) if j==0 else st_cell)) for j,c in enumerate(r)] for i,r in enumerate(diff)]
dt=Table(rows,colWidths=[34*mm,73*mm,73*mm],repeatRows=1)
dt.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),BLUE),("GRID",(0,0),(-1,-1),0.3,LGREY),
("ROWBACKGROUNDS",(0,1),(-1,-1),[colors.white,colors.HexColor("#F2F6FB")]),
("VALIGN",(0,0),(-1,-1),"TOP"),("TOPPADDING",(0,0),(-1,-1),3),("BOTTOMPADDING",(0,0),(-1,-1),3),
("LEFTPADDING",(0,0),(-1,-1),4),("RIGHTPADDING",(0,0),(-1,-1),4)]))
story.append(dt)
story.append(Spacer(1,8))
story.append(Paragraph("Вывод для CRM-Omnicomm: интерфейс техника — это отдельный «полевой» сценарий поверх тех же документов. "
"Для паритета важно предусмотреть: роль/АРМ техника с урезанным меню, форму акта с электронной подписью клиента, "
"учёт снятого оборудования при замене, фотофиксацию (вложения) и учёт SIM с движением по местам хранения.", st_body))

def footer(c,doc):
    c.saveState();c.setFont("DJ",7.5);c.setFillColor(GREY)
    c.drawString(LM,9*mm,"Аскан → CRM-Omnicomm · дополнение: роль техника-установщика · конфиденциально")
    c.drawRightString(PAGE_W-RM,9*mm,"доп. стр. %d"%doc.page)
    c.setStrokeColor(LGREY);c.setLineWidth(0.4);c.line(LM,12*mm,PAGE_W-RM,12*mm);c.restoreState()
doc=SimpleDocTemplate(OUT,pagesize=A4,leftMargin=LM,rightMargin=RM,topMargin=14*mm,bottomMargin=16*mm)
doc.build(story,onFirstPage=footer,onLaterPages=footer)
print("addendum built:",os.path.getsize(OUT),"bytes")
