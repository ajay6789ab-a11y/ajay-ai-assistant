import 'package:ajay_ai_assistant/core/theme/app_theme.dart';
import 'package:ajay_ai_assistant/data/models/models.dart';
import 'package:ajay_ai_assistant/presentation/widgets/ai_orb.dart';
import 'package:ajay_ai_assistant/presentation/widgets/common.dart';
import 'package:ajay_ai_assistant/presentation/widgets/message_bubble.dart';
import 'package:ajay_ai_assistant/presentation/widgets/mic_button.dart';
import 'package:ajay_ai_assistant/providers/assistant_provider.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Widget _host(Widget child) => MaterialApp(
      theme: AppTheme.dark,
      home: Scaffold(body: Center(child: child)),
    );

void main() {
  testWidgets('AI orb renders in every state without overflowing', (WidgetTester tester) async {
    for (final AssistantState state in AssistantState.values) {
      await tester.pumpWidget(_host(AiOrb(state: state, level: 0.6, size: 200)));
      await tester.pump(const Duration(milliseconds: 120));
      expect(find.byType(AiOrb), findsOneWidget);
      expect(tester.takeException(), isNull);
    }
  });

  testWidgets('Mic button fires its callback and swaps icon while listening',
      (WidgetTester tester) async {
    int taps = 0;
    await tester.pumpWidget(_host(
      MicButton(state: AssistantState.idle, onTap: () => taps++, haptics: false),
    ));
    expect(find.byIcon(Icons.mic_rounded), findsOneWidget);

    await tester.tap(find.byType(MicButton));
    await tester.pump();
    expect(taps, 1);

    await tester.pumpWidget(_host(
      MicButton(state: AssistantState.listening, onTap: () {}, haptics: false),
    ));
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.byIcon(Icons.graphic_eq_rounded), findsOneWidget);
  });

  testWidgets('Message bubble shows the reply, action chip and metadata',
      (WidgetTester tester) async {
    await tester.pumpWidget(_host(
      MessageBubble(
        message: ChatMessage(
          id: '1',
          role: 'assistant',
          content: 'Opening YouTube.',
          intent: 'open_app',
          confidence: 0.9,
          engine: 'rules',
          createdAt: DateTime(2026, 8, 4, 10),
          action: const AssistantAction(
            type: ActionType.openApp,
            params: <String, dynamic>{'app': 'youtube'},
          ),
        ),
      ),
    ));
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text('Opening YouTube.'), findsOneWidget);
    expect(find.text('OPENAPP'), findsOneWidget);
    expect(find.textContaining('open_app · 90%'), findsOneWidget);
  });

  testWidgets('Hindi replies render in Devanagari', (WidgetTester tester) async {
    await tester.pumpWidget(_host(
      MessageBubble(
        message: ChatMessage(
          id: '2',
          role: 'assistant',
          content: 'राहुल को कॉल कर रहा हूँ। डायल करूँ?',
          language: 'hi',
          createdAt: DateTime(2026, 8, 4),
        ),
      ),
    ));
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('राहुल को कॉल कर रहा हूँ। डायल करूँ?'), findsOneWidget);
  });

  testWidgets('Quick action card is tappable and shows its command',
      (WidgetTester tester) async {
    bool tapped = false;
    await tester.pumpWidget(_host(
      SizedBox(
        width: 180,
        child: QuickActionCard(
          suggestion: const Suggestion(
            label: 'Weather',
            icon: 'cloud',
            command: "What's the weather today?",
          ),
          onTap: () => tapped = true,
        ),
      ),
    ));
    expect(find.text('Weather'), findsOneWidget);
    await tester.tap(find.byType(QuickActionCard));
    expect(tapped, isTrue);
  });

  testWidgets('Layout survives a small 320dp screen', (WidgetTester tester) async {
    tester.view.physicalSize = const Size(320 * 3, 640 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(_host(
      const AiOrb(state: AssistantState.listening, level: 1, size: 200),
    ));
    await tester.pump(const Duration(milliseconds: 100));
    expect(tester.takeException(), isNull);
  });
}
