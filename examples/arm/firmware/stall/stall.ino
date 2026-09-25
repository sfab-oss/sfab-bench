#include <Servo.h>

// Commands 180 degrees against the fixture arm's 150-degree joint limit, so the
// servo stalls. On the bench supply (5 V, 0.3 A) the rail falls through brownout.
Servo s;

void setup() {
  Serial.begin(115200);
  Serial.println("boot");
  s.attach(9);
  s.write(180);
}

void loop() {}
