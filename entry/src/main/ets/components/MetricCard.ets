/**
 * The pieces the Generate screen's Metrics tab is made of, so that every part of it looks like the same thing: a card with a
 * title and one figure on its head line, tiles of one fact each, chips for who or what, and lines for the items of a list.
 * A card is 96% of the pane and its content 92% of that, centred. The pane is given its measured width (GeneratePage's metricsWidth):
 * a percentage inside the Scroll resolves against a wider box than the one drawn, which pushed cards against the left edge and
 * slid centred ones off the right; and padding next to a width pushes the right edge out of the pane (the cells were sliced by it).
 */

const INK: string = '#222222'
const SOFT: string = '#666666'
const FAINT: string = '#999999'
const CARD: string = '#FFFFFF'
const WELL: string = '#F5F7FA'

/** A white card: `title` and `value` on the head line, a chevron when it opens, and whatever is put inside it. */
@Component
export struct MetricCard {
  @Prop title: string = ''
  @Prop value: string = ''
  @Prop valueColor: string = INK
  /** '' for a card that does not open, else the arrow that says which way a tap goes. */
  @Prop chevron: string = ''
  onHead: () => void = (): void => {}
  @BuilderParam content: () => void = this.nothing

  @Builder
  nothing() {}

  build() {
    Column() {
      Column({ space: 8 }) {
        Row({ space: 8 }) {
          Text(this.title).fontSize(13).fontWeight(FontWeight.Bold).fontColor(INK).layoutWeight(1).maxLines(1)
          if (this.value.length > 0) {
            Text(this.value).fontSize(13).fontWeight(FontWeight.Bold).fontColor(this.valueColor).maxLines(1)
          }
          if (this.chevron.length > 0) {
            Text(this.chevron).fontSize(11).fontColor(FAINT)
          }
        }
        .width('100%')
        .onClick(() => { this.onHead() })
        this.content()
      }
      .width('92%')
      .alignItems(HorizontalAlign.Start)
    }
    .width('96%')
    .alignItems(HorizontalAlign.Center)
    .padding({ top: 12, bottom: 12 })
    .backgroundColor(CARD)
    .borderRadius(10)
  }
}

/** One fact: a label, the number, and a line saying what it means. Sits in a card, so its well is a shade darker than the card. */
@Component
export struct MetricTile {
  @Prop label: string = ''
  @Prop value: string = ''
  @Prop note: string = ''

  build() {
    Column() {
      Column({ space: 2 }) {
        Text(this.label).fontSize(10).fontColor(FAINT).maxLines(1)
        Text(this.value).fontSize(17).fontWeight(FontWeight.Bold).fontColor(INK)
          .maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
        Text(this.note).fontSize(10).fontColor(FAINT).maxLines(2).textOverflow({ overflow: TextOverflow.Ellipsis })
      }
      .alignItems(HorizontalAlign.Start)
      .padding(10)
    }
    // Two nodes, as the cells were: the outer one takes the whole slot the row gives it, the inner one holds the padding.
    .width('100%')
    .alignItems(HorizontalAlign.Start)
    .backgroundColor(WELL)
    .borderRadius(8)
  }
}

/** A small outlined label: who did the work, or which tool. */
@Component
export struct MetricChip {
  @Prop text: string = ''
  @Prop color: string = SOFT

  build() {
    Text(this.text)
      .fontSize(11)
      .fontColor(this.color)
      .border({ width: 1, color: this.color, radius: 6 })
      .padding({ left: 6, right: 6, top: 2, bottom: 2 })
      .margin({ right: 6, bottom: 4 })
  }
}

/** One item of a list: its name and its figure on one line, then what it asked for, then what came of it. */
@Component
export struct MetricLine {
  @Prop title: string = ''
  @Prop right: string = ''
  @Prop ask: string = ''
  @Prop detail: string = ''
  @Prop bad: boolean = false

  build() {
    Column({ space: 1 }) {
      Row({ space: 6 }) {
        Text(this.title).fontSize(12).fontColor(this.bad ? '#C62828' : INK).layoutWeight(1).maxLines(1)
        Text(this.right).fontSize(12).fontWeight(FontWeight.Medium).fontColor(INK)
      }
      .width('100%')
      if (this.ask.length > 0) {
        Text(this.ask).fontSize(11).fontColor(SOFT).width('100%').maxLines(2)
      }
      if (this.detail.length > 0) {
        Text(this.detail).fontSize(10).fontColor(this.bad ? '#C62828' : FAINT).width('100%').maxLines(3)
      }
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
  }
}
